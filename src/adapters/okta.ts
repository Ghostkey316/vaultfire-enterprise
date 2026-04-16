/**
 * @vaultfire/enterprise — Okta IAM Adapter
 *
 * Maps Okta Universal Directory agent records to Vaultfire on-chain identities.
 *
 * USAGE:
 *   This adapter does NOT import the Okta SDK directly — that would require
 *   installing @okta/okta-sdk-nodejs as a hard dependency. Instead, pass your
 *   own Okta client instance that satisfies the OktaClientLike interface.
 *
 * EXAMPLE:
 *   import { Client } from '@okta/okta-sdk-nodejs';
 *   const oktaClient = new Client({ orgUrl: '...', token: process.env.OKTA_API_TOKEN });
 *   const adapter = new OktaAdapter(oktaClient, { agentTypeAttribute: 'vaultfire_address' });
 *
 * SECURITY: Never hardcode API tokens. Use process.env.OKTA_API_TOKEN.
 */

import { ethers } from 'ethers';
import type { AgentMapping, IamAgentRecord } from '../types';
import type { IamAdapter } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Okta client interface (avoids hard dependency on @okta/okta-sdk-nodejs)
// ─────────────────────────────────────────────────────────────────────────────

export interface OktaUserProfile {
  login: string;
  displayName?: string;
  userType?: string;
  department?: string;
  /** Custom attribute storing the Vaultfire on-chain address */
  [key: string]: unknown;
}

export interface OktaUser {
  id: string;
  status: string;
  profile: OktaUserProfile;
}

/**
 * Minimal subset of the Okta SDK client that this adapter uses.
 * Implement this interface with the real SDK or a mock for testing.
 */
export interface OktaClientLike {
  listUsers(options?: { filter?: string; limit?: number }): AsyncIterable<OktaUser>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Okta adapter configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface OktaAdapterConfig {
  /**
   * Custom Okta profile attribute holding the on-chain address.
   * Defaults to 'vaultfireAddress'.
   */
  onChainAddressAttribute?: string;
  /**
   * Okta profile userType values that indicate agent records.
   * Defaults to ['agent', 'service', 'bot', 'ai-agent'].
   */
  agentUserTypes?: string[];
  /**
   * Optional SCIM/API filter string to limit user results.
   * Example: 'profile.userType eq "agent"'
   */
  filter?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OktaAdapter implementation
// ─────────────────────────────────────────────────────────────────────────────

export class OktaAdapter implements IamAdapter {
  readonly providerName = 'Okta';

  private readonly client: OktaClientLike;
  private readonly onChainAddressAttribute: string;
  private readonly agentUserTypes: string[];
  private readonly filter?: string;

  constructor(client: OktaClientLike, config: OktaAdapterConfig = {}) {
    this.client = client;
    this.onChainAddressAttribute = config.onChainAddressAttribute ?? 'vaultfireAddress';
    this.agentUserTypes = config.agentUserTypes ?? ['agent', 'service', 'bot', 'ai-agent'];
    this.filter = config.filter;
  }

  async listAgentRecords(): Promise<IamAgentRecord[]> {
    const records: IamAgentRecord[] = [];

    for await (const user of this.client.listUsers({ filter: this.filter })) {
      const record = this.userToRecord(user);
      records.push(record);
    }

    return records;
  }

  extractOnChainAddress(record: IamAgentRecord): string | undefined {
    const raw = record.attributes[this.onChainAddressAttribute];
    if (typeof raw === 'string' && ethers.isAddress(raw)) {
      return ethers.getAddress(raw);
    }
    return undefined;
  }

  isAgentRecord(record: IamAgentRecord): boolean {
    const userType = record.attributes['userType'];
    if (typeof userType === 'string') {
      return this.agentUserTypes.some((t) => t.toLowerCase() === userType.toLowerCase());
    }
    return false;
  }

  buildMapping(record: IamAgentRecord, onChainAddress: string): AgentMapping {
    return {
      enterpriseId: record.id,
      onChainAddress: ethers.getAddress(onChainAddress),
      iamProvider: this.providerName,
      mappedAt: new Date(),
      metadata: {
        login: record.attributes['login'],
        displayName: record.name,
        userType: record.attributes['userType'],
        department: record.attributes['department'],
      },
    };
  }

  private userToRecord(user: OktaUser): IamAgentRecord {
    return {
      id: user.id,
      name: (user.profile.displayName ?? user.profile.login) || user.id,
      type: user.profile.userType ?? 'unknown',
      provider: this.providerName,
      onChainAddress: this.extractOnChainAddressFromProfile(user.profile),
      attributes: user.profile as Record<string, unknown>,
    };
  }

  private extractOnChainAddressFromProfile(
    profile: OktaUserProfile,
  ): string | undefined {
    const raw = profile[this.onChainAddressAttribute];
    if (typeof raw === 'string' && ethers.isAddress(raw)) {
      return ethers.getAddress(raw);
    }
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Create an OktaAdapter using env vars for configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convenience factory that reads OKTA_DOMAIN and OKTA_API_TOKEN from
 * environment variables and creates an OktaAdapter.
 *
 * Requires @okta/okta-sdk-nodejs installed in the consuming project.
 * This function is intentionally async to support dynamic import.
 */
export function createOktaAdapterFromEnv(
  config: OktaAdapterConfig = {},
): OktaAdapter {
  const domain = process.env['OKTA_DOMAIN'];
  const token = process.env['OKTA_API_TOKEN'];

  if (!domain) throw new Error('OKTA_DOMAIN environment variable is not set.');
  if (!token) throw new Error('OKTA_API_TOKEN environment variable is not set.');

  // Dynamic require to avoid hard TypeScript dependency on optional SDK
  let OktaClient: new (opts: { orgUrl: string; token: string }) => OktaClientLike;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = (require('@okta/okta-sdk-nodejs') as unknown) as {
      Client: new (opts: { orgUrl: string; token: string }) => OktaClientLike;
    };
    OktaClient = mod.Client;
  } catch {
    throw new Error(
      'Please install @okta/okta-sdk-nodejs to use createOktaAdapterFromEnv: ' +
        'npm install @okta/okta-sdk-nodejs',
    );
  }

  const client = new OktaClient({ orgUrl: `https://${domain}`, token });
  return new OktaAdapter(client, config);
}
