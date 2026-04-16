/**
 * @vaultfire/enterprise — VaultfireEnterpriseClient
 * The main client for bridging enterprise IAM systems with Vaultfire on-chain trust.
 */

import { ethers, JsonRpcProvider, Contract, isAddress, getAddress, formatEther, parseEther } from 'ethers';
import {
  CHAIN_CONFIGS,
  IDENTITY_ABI,
  PARTNERSHIP_ABI,
  REPUTATION_ABI,
} from './contracts';
import { computeStreetCred } from './scoring';
import type {
  AgentMapping,
  BondStatus,
  Bond,
  CrossChainReport,
  EnterpriseConfig,
  OnChainIdentity,
  PolicyResult,
  ReputationData,
  StreetCred,
  SupportedChain,
  TrustPolicy,
  TrustReport,
  VerifyOptions,
} from './types';
import { evaluatePolicy } from './policies';

const ALL_CHAINS: SupportedChain[] = ['base', 'avalanche', 'arbitrum', 'polygon'];

export class VaultfireEnterpriseClient {
  private readonly config: Required<
    Pick<EnterpriseConfig, 'primaryChain' | 'timeout' | 'debug'>
  > &
    EnterpriseConfig;
  /** In-memory agent mapping store (enterprise use: replace with a DB) */
  private readonly mappings: Map<string, AgentMapping> = new Map();

  constructor(config: EnterpriseConfig = {}) {
    this.config = {
      primaryChain: 'base',
      timeout: 10_000,
      debug: false,
      ...config,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private log(message: string, ...args: unknown[]): void {
    if (this.config.debug) {
      console.debug(`[VaultfireEnterprise] ${message}`, ...args);
    }
  }

  private getProvider(chain: SupportedChain): JsonRpcProvider {
    const chainCfg = CHAIN_CONFIGS[chain];
    const rpcUrl = this.config.rpcUrls?.[chain] ?? chainCfg.rpcUrl;
    return new JsonRpcProvider(rpcUrl, chainCfg.chainId);
  }

  private getIdentityContract(chain: SupportedChain): Contract {
    const provider = this.getProvider(chain);
    return new Contract(
      CHAIN_CONFIGS[chain].contracts.identity,
      IDENTITY_ABI,
      provider,
    );
  }

  private getPartnershipContract(chain: SupportedChain): Contract {
    const provider = this.getProvider(chain);
    return new Contract(
      CHAIN_CONFIGS[chain].contracts.partnership,
      PARTNERSHIP_ABI,
      provider,
    );
  }

  private getReputationContract(chain: SupportedChain): Contract {
    const provider = this.getProvider(chain);
    return new Contract(
      CHAIN_CONFIGS[chain].contracts.reputation,
      REPUTATION_ABI,
      provider,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Agent Mapping
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Map an enterprise IAM agent to an on-chain address.
   * The mapping is stored in-memory; persist to your own store for production use.
   */
  async mapAgent(
    enterpriseId: string,
    onChainAddress: string,
    metadata?: Record<string, unknown>,
  ): Promise<AgentMapping> {
    if (!isAddress(onChainAddress)) {
      throw new Error(`Invalid Ethereum address: ${onChainAddress}`);
    }

    const mapping: AgentMapping = {
      enterpriseId,
      onChainAddress: getAddress(onChainAddress),
      iamProvider: this.config.iamProvider ?? 'unknown',
      mappedAt: new Date(),
      metadata,
    };

    this.mappings.set(enterpriseId, mapping);
    this.log('Mapped agent', enterpriseId, '->', onChainAddress);
    return mapping;
  }

  /**
   * Retrieve a previously stored agent mapping by enterprise ID.
   */
  getMapping(enterpriseId: string): AgentMapping | undefined {
    return this.mappings.get(enterpriseId);
  }

  /**
   * List all stored agent mappings.
   */
  listMappings(): AgentMapping[] {
    return Array.from(this.mappings.values());
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Trust verification
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Look up on-chain trust for an external agent. Returns a full TrustReport.
   */
  async verifyExternalAgent(
    address: string,
    options: VerifyOptions = {},
  ): Promise<TrustReport> {
    if (!isAddress(address)) {
      throw new Error(`Invalid Ethereum address: ${address}`);
    }

    const chain = options.chain ?? this.config.primaryChain;
    const checksumAddress = getAddress(address);

    this.log('Verifying agent', checksumAddress, 'on', chain);

    const [identity, bondStatus, reputation] = await Promise.all([
      this.fetchIdentity(checksumAddress, chain),
      options.includeBonds !== false
        ? this.fetchBondStatus(checksumAddress, checksumAddress, chain)
        : Promise.resolve(this.emptyBondStatus(checksumAddress, chain)),
      options.includeReputation !== false
        ? this.fetchReputation(checksumAddress, chain)
        : Promise.resolve(null),
    ]);

    // Compute Street Cred from on-chain data
    const streetCred = computeStreetCred({
      address: checksumAddress,
      chain,
      isRegistered: identity !== null && identity.active,
      bondCount: bondStatus.bonds.length,
      activeBondCount: bondStatus.activeBonds.length,
      totalBondValueWei: this.parseBondValueWei(bondStatus.totalBondValue),
    });

    return {
      address: checksumAddress,
      chain,
      hasIdentity: identity !== null,
      identity,
      streetCred,
      bondStatus,
      reputation,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Check if an agent meets the minimum requirements of a trust policy.
   */
  async meetsPolicy(address: string, policy: TrustPolicy): Promise<PolicyResult> {
    const trustReport = await this.verifyExternalAgent(address);
    return evaluatePolicy(trustReport, policy);
  }

  /**
   * Get the full Street Cred breakdown for an agent.
   */
  async getStreetCred(address: string, chain?: SupportedChain): Promise<StreetCred> {
    const report = await this.verifyExternalAgent(address, {
      chain,
      includeBonds: true,
      includeReputation: false,
    });
    return report.streetCred;
  }

  /**
   * Check bond status between two agents on a specific chain.
   */
  async checkBondStatus(
    agent1: string,
    agent2: string,
    chain?: SupportedChain,
  ): Promise<BondStatus> {
    const targetChain = chain ?? this.config.primaryChain;
    if (!isAddress(agent1)) throw new Error(`Invalid address: ${agent1}`);
    if (!isAddress(agent2)) throw new Error(`Invalid address: ${agent2}`);

    return this.fetchBondStatus(
      getAddress(agent1),
      getAddress(agent2),
      targetChain,
    );
  }

  /**
   * Batch-verify multiple agents in parallel.
   */
  async batchVerify(
    addresses: string[],
    options: VerifyOptions = {},
  ): Promise<TrustReport[]> {
    return Promise.all(addresses.map((addr) => this.verifyExternalAgent(addr, options)));
  }

  /**
   * Perform a multi-chain scan across all four Vaultfire chains.
   */
  async crossChainScan(address: string): Promise<CrossChainReport> {
    if (!isAddress(address)) {
      throw new Error(`Invalid Ethereum address: ${address}`);
    }

    const checksumAddress = getAddress(address);
    this.log('Cross-chain scan for', checksumAddress);

    const results = await Promise.allSettled(
      ALL_CHAINS.map((chain) =>
        this.verifyExternalAgent(checksumAddress, { chain }),
      ),
    );

    const reports: Partial<Record<SupportedChain, TrustReport | null>> = {};
    const errors: Partial<Record<SupportedChain, string | null>> = {};

    for (let i = 0; i < ALL_CHAINS.length; i++) {
      const chain = ALL_CHAINS[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        reports[chain] = result.value;
        errors[chain] = null;
      } else {
        reports[chain] = null;
        errors[chain] = result.reason?.message ?? 'Unknown error';
      }
    }

    const validReports = Object.values(reports).filter(
      (r): r is TrustReport => r !== null,
    );

    const bestScore = validReports.reduce((max, r) => Math.max(max, r.streetCred.score), 0);
    const bestTier =
      validReports.reduce(
        (best, r) => {
          const tiers = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'];
          const idx = tiers.indexOf(r.streetCred.tier);
          return idx > tiers.indexOf(best) ? r.streetCred.tier : best;
        },
        'None' as TrustReport['streetCred']['tier'],
      );

    const recognizedOn = validReports
      .filter((r) => r.hasIdentity)
      .map((r) => r.chain);

    return {
      address: checksumAddress,
      chains: ALL_CHAINS,
      reports: reports as Record<SupportedChain, TrustReport | null>,
      errors: errors as Record<SupportedChain, string | null>,
      bestScore,
      bestTier,
      recognizedOn,
      generatedAt: new Date().toISOString(),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private chain-query helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async fetchIdentity(
    address: string,
    chain: SupportedChain,
  ): Promise<OnChainIdentity | null> {
    try {
      const contract = this.getIdentityContract(chain);
      const result: [string, boolean, string, bigint] = await contract.getAgent(address);
      const [agentURI, active, agentType, registeredAt] = result;

      // If URI is empty string the agent is not registered
      if (!agentURI) return null;

      return {
        address,
        agentURI,
        agentType,
        active,
        registeredAt: new Date(Number(registeredAt) * 1000),
        chain,
      };
    } catch {
      return null;
    }
  }

  private async fetchBondStatus(
    agent1: string,
    _agent2: string,
    chain: SupportedChain,
  ): Promise<BondStatus> {
    try {
      const contract = this.getPartnershipContract(chain);
      const bondIds: bigint[] = await contract.getBondsByParticipant(agent1);

      const bondDetails = await Promise.allSettled(
        bondIds.map(async (id) => {
          const raw: [string, string, string, bigint, boolean, bigint] =
            await contract.getBond(id);
          const [a1, a2, partnershipType, value, active, createdAt] = raw;
          const bond: Bond = {
            bondId: id.toString(),
            agent1: a1,
            agent2: a2,
            partnershipType,
            value: formatEther(value),
            active,
            createdAt: new Date(Number(createdAt) * 1000),
            chain,
          };
          return bond;
        }),
      );

      const bonds = bondDetails
        .filter((r): r is PromiseFulfilledResult<Bond> => r.status === 'fulfilled')
        .map((r) => r.value);

      const activeBonds = bonds.filter((b) => b.active);
      const totalBondValue = bonds.reduce((sum, b) => sum + parseFloat(b.value), 0);

      return {
        agent1,
        agent2: _agent2,
        chain,
        bonded: bonds.length > 0,
        bonds,
        activeBonds,
        totalBondValue: totalBondValue.toFixed(6),
        hasActiveBond: activeBonds.length > 0,
      };
    } catch {
      return this.emptyBondStatus(agent1, chain);
    }
  }

  private async fetchReputation(
    address: string,
    chain: SupportedChain,
  ): Promise<ReputationData | null> {
    try {
      const contract = this.getReputationContract(chain);
      const result: [bigint, bigint, bigint, bigint] =
        await contract.getReputation(address);
      const [averageRating, totalFeedbacks, verifiedFeedbacks, lastUpdated] = result;

      return {
        averageRating: Number(averageRating),
        totalFeedbacks: Number(totalFeedbacks),
        verifiedFeedbacks: Number(verifiedFeedbacks),
        verifiedPercentage:
          Number(totalFeedbacks) > 0
            ? Math.round((Number(verifiedFeedbacks) / Number(totalFeedbacks)) * 100)
            : 0,
        lastUpdated:
          Number(lastUpdated) > 0 ? new Date(Number(lastUpdated) * 1000) : null,
      };
    } catch {
      return null;
    }
  }

  private emptyBondStatus(address: string, chain: SupportedChain): BondStatus {
    return {
      agent1: address,
      agent2: address,
      chain,
      bonded: false,
      bonds: [],
      activeBonds: [],
      totalBondValue: '0',
      hasActiveBond: false,
    };
  }

  private parseBondValueWei(ethValueStr: string): bigint {
    try {
      const float = parseFloat(ethValueStr);
      if (isNaN(float) || float <= 0) return 0n;
      return parseEther(float.toFixed(18));
    } catch {
      return 0n;
    }
  }
}
