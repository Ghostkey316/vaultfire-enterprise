/**
 * @vaultfire/enterprise — IAM Adapter Interface
 *
 * Each IAM adapter implements IamAdapter to provide a standard bridge
 * between enterprise identity providers and Vaultfire on-chain identities.
 *
 * IMPORTANT: These are interface definitions. Concrete implementations must
 * inject their own SDK clients (e.g. @okta/okta-sdk-nodejs, @azure/identity).
 * This package does not depend on those SDKs to keep the install footprint small.
 */

import type { AgentMapping, IamAgentRecord, IamSyncReport } from '../types';

/**
 * The standard interface all IAM adapters must implement.
 */
export interface IamAdapter {
  /** Human-readable provider name (e.g. "Okta", "Azure AD") */
  readonly providerName: string;

  /**
   * List agent records from the IAM provider.
   * Returns raw records; mapping to on-chain addresses is done separately.
   */
  listAgentRecords(): Promise<IamAgentRecord[]>;

  /**
   * Extract an on-chain address from a raw IAM record, if present.
   * Looks for a configured custom attribute (e.g. vaultfire_address).
   */
  extractOnChainAddress(record: IamAgentRecord): string | undefined;

  /**
   * Validate that an IAM record represents an agent (vs. human user).
   */
  isAgentRecord(record: IamAgentRecord): boolean;

  /**
   * Build an AgentMapping from a record and a known on-chain address.
   */
  buildMapping(record: IamAgentRecord, onChainAddress: string): AgentMapping;
}

/**
 * The result of resolving an IAM record to an on-chain address.
 */
export interface IamResolutionResult {
  record: IamAgentRecord;
  onChainAddress: string | undefined;
  /** Why the address could not be resolved (if applicable) */
  error?: string;
}

/**
 * Options passed to adapter sync operations.
 */
export interface AdapterSyncOptions {
  /** Filter by agent type/role */
  agentType?: string;
  /** Maximum number of records to process */
  limit?: number;
  /** Include records that have no on-chain address mapping */
  includeUnmapped?: boolean;
}

/**
 * Factory function type for creating IAM adapters.
 */
export type AdapterFactory<TConfig> = (config: TConfig) => IamAdapter;

/**
 * A sync runner that uses an adapter + VaultfireEnterpriseClient to generate
 * a full IamSyncReport.
 */
export interface SyncRunner {
  run(options?: AdapterSyncOptions): Promise<IamSyncReport>;
}
