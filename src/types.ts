/**
 * @vaultfire/enterprise — Core Types
 * Bridge enterprise IAM systems with Vaultfire on-chain trust infrastructure.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Chain configuration
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedChain = 'base' | 'avalanche' | 'arbitrum' | 'polygon';

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  contracts: {
    identity: string;
    partnership: string;
    accountability: string;
    reputation: string;
    bridge: string;
    vns?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enterprise client configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface EnterpriseConfig {
  /** Primary chain for trust queries. Defaults to 'base'. */
  primaryChain?: SupportedChain;
  /** Override RPC URLs (useful for private endpoints) */
  rpcUrls?: Partial<Record<SupportedChain, string>>;
  /** IAM provider type */
  iamProvider?: 'okta' | 'azure' | 'generic-oidc';
  /** Optional IAM-specific configuration */
  iamConfig?: OktaConfig | AzureConfig | OidcConfig;
  /** Request timeout in milliseconds. Defaults to 10000. */
  timeout?: number;
  /** Enable verbose logging */
  debug?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// IAM provider configurations
// ─────────────────────────────────────────────────────────────────────────────

export interface OktaConfig {
  domain: string;
  /** Use process.env.OKTA_API_TOKEN — never hardcode */
  apiToken: string;
  /** Okta group to scan for agent identities */
  agentGroup?: string;
}

export interface AzureConfig {
  tenantId: string;
  clientId: string;
  /** Use process.env.AZURE_CLIENT_SECRET — never hardcode */
  clientSecret: string;
  /** Azure subscription ID for filtering */
  subscriptionId?: string;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  /** Use process.env.OIDC_CLIENT_SECRET — never hardcode */
  clientSecret: string;
  /** Claims to extract as agent metadata */
  agentClaims?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent mapping
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentMapping {
  /** Enterprise IAM identifier (e.g. Okta user ID, Azure service principal ID) */
  enterpriseId: string;
  /** On-chain Ethereum address */
  onChainAddress: string;
  /** IAM provider that issued the identity */
  iamProvider: string;
  /** Timestamp of mapping creation */
  mappedAt: Date;
  /** Optional metadata (e.g. department, role) */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// On-chain identity data
// ─────────────────────────────────────────────────────────────────────────────

export interface OnChainIdentity {
  address: string;
  agentURI: string;
  agentType: string;
  active: boolean;
  registeredAt: Date;
  chain: SupportedChain;
}

// ─────────────────────────────────────────────────────────────────────────────
// Street Cred scoring
// ─────────────────────────────────────────────────────────────────────────────

export type StreetCredTier = 'None' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface StreetCred {
  address: string;
  chain: SupportedChain;
  /** Total score 0-95 */
  score: number;
  tier: StreetCredTier;
  breakdown: {
    /** 30 pts if registered */
    identityScore: number;
    /** 0-25 pts for having a bond */
    bondScore: number;
    /** 0-15 pts for active bond */
    activeBondScore: number;
    /** 0-20 pts bond tier bonus */
    bondTierBonus: number;
    /** 0-5 pts for multiple bonds */
    multipleBondsScore: number;
  };
  computedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bond data
// ─────────────────────────────────────────────────────────────────────────────

export interface Bond {
  bondId: string;
  agent1: string;
  agent2: string;
  partnershipType: string;
  /** Bond value in ETH */
  value: string;
  active: boolean;
  createdAt: Date;
  chain: SupportedChain;
}

export interface BondStatus {
  agent1: string;
  agent2: string;
  chain: SupportedChain;
  bonded: boolean;
  bonds: Bond[];
  activeBonds: Bond[];
  totalBondValue: string;
  hasActiveBond: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trust policies
// ─────────────────────────────────────────────────────────────────────────────

export interface PolicyRules {
  /** Minimum Street Cred score (0-95) */
  minStreetCred?: number;
  /** Agent must have a registered on-chain identity */
  requireIdentity?: boolean;
  /** Agent must have at least one bond */
  requireBond?: boolean;
  /** Agent must have at least one active bond */
  requireActiveBond?: boolean;
  /** Minimum total bond value in ETH */
  minBondValue?: string;
  /** Allowed chains (if not set, any chain is accepted) */
  allowedChains?: SupportedChain[];
  /** Required Street Cred tier */
  minTier?: StreetCredTier;
  /** Custom validator function */
  customValidator?: (report: TrustReport) => boolean;
}

export interface TrustPolicy extends PolicyRules {
  name: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trust reports
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyOptions {
  chain?: SupportedChain;
  includeReputation?: boolean;
  includeBonds?: boolean;
}

export interface ReputationData {
  averageRating: number;
  totalFeedbacks: number;
  verifiedFeedbacks: number;
  verifiedPercentage: number;
  lastUpdated: Date | null;
}

export interface TrustReport {
  address: string;
  chain: SupportedChain;
  /** Whether the agent has a registered on-chain identity */
  hasIdentity: boolean;
  identity: OnChainIdentity | null;
  streetCred: StreetCred;
  bondStatus: BondStatus;
  reputation: ReputationData | null;
  /** ISO timestamp */
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy evaluation result
// ─────────────────────────────────────────────────────────────────────────────

export interface PolicyViolation {
  rule: string;
  required: string | number | boolean;
  actual: string | number | boolean;
  message: string;
}

export interface PolicyResult {
  address: string;
  policy: TrustPolicy;
  passes: boolean;
  violations: PolicyViolation[];
  trustReport: TrustReport;
  evaluatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-chain report
// ─────────────────────────────────────────────────────────────────────────────

export interface CrossChainReport {
  address: string;
  chains: SupportedChain[];
  reports: Record<SupportedChain, TrustReport | null>;
  errors: Record<SupportedChain, string | null>;
  /** Best score across all chains */
  bestScore: number;
  /** Best tier across all chains */
  bestTier: StreetCredTier;
  /** Chains where the agent is recognized */
  recognizedOn: SupportedChain[];
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// IAM adapter interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface IamAgentRecord {
  /** Unique identifier in the IAM system */
  id: string;
  /** Display name */
  name: string;
  /** Agent type/role */
  type: string;
  /** Mapped on-chain address (if configured) */
  onChainAddress?: string;
  /** Raw attributes from the IAM provider */
  attributes: Record<string, unknown>;
  /** IAM provider name */
  provider: string;
}

export interface IamSyncReport {
  provider: string;
  totalRecords: number;
  mappedRecords: number;
  unmappedRecords: number;
  trustReports: Array<{
    iamRecord: IamAgentRecord;
    trustReport: TrustReport | null;
    error: string | null;
  }>;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware types
// ─────────────────────────────────────────────────────────────────────────────

export interface TrustGateOptions {
  policy: TrustPolicy;
  /** Header name to read agent address from. Default: 'x-agent-address' */
  addressHeader?: string;
  /** Chain to check. Default: primaryChain from client config */
  chain?: SupportedChain;
  /** Custom 403 response message */
  rejectionMessage?: string;
  /** If true, attach trust report to req.vaultfireTrust */
  attachReport?: boolean;
}

/**
 * Extended Express Request with Vaultfire trust data attached.
 */
export interface VaultfireRequest {
  vaultfireTrust?: {
    address: string;
    policyResult: PolicyResult;
    trustReport: TrustReport;
  };
}
