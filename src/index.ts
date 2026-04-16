/**
 * @vaultfire/enterprise
 *
 * Bridge enterprise IAM systems (Okta, Azure AD, OIDC) with
 * Vaultfire on-chain agent identity and trust infrastructure.
 *
 * Deployed contracts:
 *   Base (8453):      Identity 0x35978DB675576598F0781dA2133E94cdCf4858bC
 *   Avalanche (43114): Identity 0x57741F4116925341d8f7Eb3F381d98e07C73B4a3
 *   Arbitrum (42161):  Identity 0x6298c62FDA57276DC60de9E716fbBAc23d06D5F1
 *   Polygon (137):     Identity 0x6298c62FDA57276DC60de9E716fbBAc23d06D5F1
 *
 * @author Ghostkey316 <ghostkey316@proton.me>
 * @license MIT
 */

// ─────────────────────────────────────────────────────────────────────────────
// Main client
// ─────────────────────────────────────────────────────────────────────────────
export { VaultfireEnterpriseClient } from './client';

// ─────────────────────────────────────────────────────────────────────────────
// Policies
// ─────────────────────────────────────────────────────────────────────────────
export { POLICIES, createPolicy, evaluatePolicy } from './policies';
export { getTier, tierToNumber, meetsMinTier, computeStreetCred } from './scoring';

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────
export { vaultfireTrustGate, vaultfireFastifyGate } from './middleware';

// ─────────────────────────────────────────────────────────────────────────────
// IAM Adapters
// ─────────────────────────────────────────────────────────────────────────────
export { OktaAdapter, createOktaAdapterFromEnv } from './adapters/okta';
export { AzureAdapter, createAzureAdapterFromEnv } from './adapters/azure';
export {
  GenericOidcAdapter,
  createOidcAdapterFromEnv,
} from './adapters/generic';

// ─────────────────────────────────────────────────────────────────────────────
// Types — everything exported for downstream TypeScript consumers
// ─────────────────────────────────────────────────────────────────────────────
export type {
  // Config
  EnterpriseConfig,
  OktaConfig,
  AzureConfig,
  OidcConfig,
  ChainConfig,
  SupportedChain,
  // Mapping
  AgentMapping,
  // Identity
  OnChainIdentity,
  // Street Cred
  StreetCred,
  StreetCredTier,
  // Bonds
  Bond,
  BondStatus,
  // Trust reports
  TrustReport,
  VerifyOptions,
  ReputationData,
  // Policies
  PolicyRules,
  TrustPolicy,
  PolicyResult,
  PolicyViolation,
  // Cross-chain
  CrossChainReport,
  // IAM
  IamAgentRecord,
  IamSyncReport,
  // Middleware
  TrustGateOptions,
  VaultfireRequest,
} from './types';

export type {
  IamAdapter,
  IamResolutionResult,
  AdapterSyncOptions,
  SyncRunner,
} from './adapters/types';

export type {
  OktaClientLike,
  OktaUser,
  OktaUserProfile,
  OktaAdapterConfig,
} from './adapters/okta';

export type {
  AzureGraphClientLike,
  AzureServicePrincipal,
  AzureAdapterConfig,
} from './adapters/azure';

export type {
  OidcClaims,
  GenericOidcAdapterConfig,
} from './adapters/generic';

// ─────────────────────────────────────────────────────────────────────────────
// Contract addresses (public, read-only reference)
// ─────────────────────────────────────────────────────────────────────────────
export { CHAIN_CONFIGS } from './contracts';
