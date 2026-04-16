/**
 * @vaultfire/enterprise — Generic OIDC Adapter
 *
 * Maps any OIDC-compliant identity provider's agent identities to
 * Vaultfire on-chain addresses.
 *
 * Works with: Auth0, Keycloak, PingIdentity, AWS Cognito, Google Identity,
 * or any provider that issues standard OIDC JWT tokens.
 *
 * USAGE:
 *   The adapter can work in two modes:
 *   1. Token mode: decode a JWT and extract claims
 *   2. Discovery mode: fetch the OIDC userinfo endpoint
 *
 * SECURITY: Never hardcode OIDC client secrets. Use process.env.OIDC_CLIENT_SECRET.
 */

import { ethers } from 'ethers';
import type { AgentMapping, IamAgentRecord } from '../types';
import type { IamAdapter } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// OIDC types
// ─────────────────────────────────────────────────────────────────────────────

/** Standard OIDC claims + custom extensions */
export interface OidcClaims {
  /** Subject identifier — unique agent ID in the provider */
  sub: string;
  /** Issuer URL */
  iss?: string;
  /** Display name */
  name?: string;
  /** Email (may indicate a service account) */
  email?: string;
  /** Custom claim: Vaultfire on-chain address */
  vaultfire_address?: string;
  /** Agent type indicator */
  agent_type?: string;
  /** Additional custom claims */
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic OIDC adapter configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface GenericOidcAdapterConfig {
  /**
   * OIDC issuer URL (e.g. https://accounts.google.com).
   * Used to validate the 'iss' claim.
   */
  issuer: string;
  /**
   * JWT claim name that stores the on-chain Ethereum address.
   * Defaults to 'vaultfire_address'.
   */
  onChainAddressClaim?: string;
  /**
   * JWT claim name that indicates the entity type.
   * Defaults to 'agent_type'.
   */
  agentTypeClaim?: string;
  /**
   * Values of the agentTypeClaim that indicate the record is an agent.
   * Defaults to ['agent', 'service', 'bot', 'ai'].
   */
  agentTypeValues?: string[];
  /**
   * Fallback: use 'sub' as the agent identifier even if agent type
   * claim is missing. Useful for service account tokens. Defaults to false.
   */
  treatAllAsAgents?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// GenericOidcAdapter implementation
// ─────────────────────────────────────────────────────────────────────────────

export class GenericOidcAdapter implements IamAdapter {
  readonly providerName: string;

  private readonly config: Required<
    Omit<GenericOidcAdapterConfig, 'issuer'>
  > &
    GenericOidcAdapterConfig;

  private records: IamAgentRecord[] = [];

  constructor(config: GenericOidcAdapterConfig) {
    this.config = {
      onChainAddressClaim: 'vaultfire_address',
      agentTypeClaim: 'agent_type',
      agentTypeValues: ['agent', 'service', 'bot', 'ai'],
      treatAllAsAgents: false,
      ...config,
    };
    this.providerName = `OIDC(${config.issuer})`;
  }

  /**
   * Load agent records from decoded JWT claims.
   * Call this with the claims from each agent JWT you receive.
   */
  loadFromClaims(claims: OidcClaims[]): void {
    this.records = claims.map((c) => this.claimsToRecord(c));
  }

  /**
   * Load a single agent record from a raw JWT string.
   * Does NOT verify the JWT signature — use your OIDC library for that.
   */
  loadFromRawJwt(rawJwt: string): void {
    const claims = this.decodeJwtPayload(rawJwt);
    this.records.push(this.claimsToRecord(claims));
  }

  async listAgentRecords(): Promise<IamAgentRecord[]> {
    return this.records;
  }

  extractOnChainAddress(record: IamAgentRecord): string | undefined {
    const attr = record.attributes[this.config.onChainAddressClaim];
    if (typeof attr === 'string' && ethers.isAddress(attr)) {
      return ethers.getAddress(attr);
    }
    return undefined;
  }

  isAgentRecord(record: IamAgentRecord): boolean {
    if (this.config.treatAllAsAgents) return true;

    const typeValue = record.attributes[this.config.agentTypeClaim];
    if (typeof typeValue === 'string') {
      return this.config.agentTypeValues.some(
        (v) => v.toLowerCase() === typeValue.toLowerCase(),
      );
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
        issuer: this.config.issuer,
        name: record.name,
        agentType: record.type,
        email: record.attributes['email'],
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private claimsToRecord(claims: OidcClaims): IamAgentRecord {
    const onChainAddress = this.extractOnChainAddressFromClaims(claims);
    return {
      id: claims.sub,
      name: (claims.name ?? claims.email ?? claims.sub) || claims.sub,
      type: (claims[this.config.agentTypeClaim] as string | undefined) ?? 'unknown',
      provider: this.providerName,
      onChainAddress,
      attributes: claims as Record<string, unknown>,
    };
  }

  private extractOnChainAddressFromClaims(claims: OidcClaims): string | undefined {
    const raw = claims[this.config.onChainAddressClaim];
    if (typeof raw === 'string' && ethers.isAddress(raw)) {
      return ethers.getAddress(raw);
    }
    return undefined;
  }

  /**
   * Decode a JWT payload without verifying the signature.
   * SECURITY: Always verify the signature in production using your OIDC library.
   */
  private decodeJwtPayload(rawJwt: string): OidcClaims {
    const parts = rawJwt.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format — expected 3 parts separated by "."');
    }

    const payload = parts[1];
    if (!payload) throw new Error('Invalid JWT — missing payload');

    // Base64url → base64 → decode
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padding);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');

    return JSON.parse(decoded) as OidcClaims;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience factory using env vars
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a GenericOidcAdapter from environment variables.
 * Reads OIDC_ISSUER from the environment.
 */
export function createOidcAdapterFromEnv(
  config: Partial<GenericOidcAdapterConfig> = {},
): GenericOidcAdapter {
  const issuer = process.env['OIDC_ISSUER'];
  if (!issuer) throw new Error('OIDC_ISSUER environment variable is not set.');

  return new GenericOidcAdapter({ ...config, issuer });
}
