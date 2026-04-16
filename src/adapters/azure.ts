/**
 * @vaultfire/enterprise — Azure Active Directory Adapter
 *
 * Maps Azure AD service principals (managed identities / app registrations)
 * to Vaultfire on-chain agent identities.
 *
 * USAGE:
 *   This adapter does NOT import @azure/identity or @microsoft/microsoft-graph-client
 *   directly. Pass your own client instance that satisfies the AzureGraphClientLike
 *   interface.
 *
 * EXAMPLE:
 *   import { ClientSecretCredential } from '@azure/identity';
 *   import { Client } from '@microsoft/microsoft-graph-client';
 *   import { TokenCredentialAuthenticationProvider } from
 *     '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
 *
 *   const credential = new ClientSecretCredential(
 *     process.env.AZURE_TENANT_ID,
 *     process.env.AZURE_CLIENT_ID,
 *     process.env.AZURE_CLIENT_SECRET,   // from env — never hardcode
 *   );
 *   const authProvider = new TokenCredentialAuthenticationProvider(credential, {
 *     scopes: ['https://graph.microsoft.com/.default'],
 *   });
 *   const graphClient = Client.initWithMiddleware({ authProvider });
 *   const adapter = new AzureAdapter(graphClient);
 *
 * SECURITY: Never hardcode tenant ID, client ID, or client secrets.
 *           Use process.env.AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.
 */

import { ethers } from 'ethers';
import type { AgentMapping, IamAgentRecord } from '../types';
import type { IamAdapter } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Azure Graph API interfaces (avoids hard SDK dependency)
// ─────────────────────────────────────────────────────────────────────────────

export interface AzureServicePrincipal {
  id: string;
  displayName: string;
  appId: string;
  servicePrincipalType: string;
  tags?: string[];
  /** Custom extension attributes */
  [key: string]: unknown;
}

export interface AzureGraphResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

/**
 * Minimal Microsoft Graph client interface.
 * Compatible with @microsoft/microsoft-graph-client.
 */
export interface AzureGraphClientLike {
  api(path: string): {
    filter(filter: string): { get(): Promise<AzureGraphResponse<AzureServicePrincipal>> };
    get(): Promise<AzureGraphResponse<AzureServicePrincipal>>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Azure adapter configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface AzureAdapterConfig {
  /**
   * Extension attribute or tag pattern that stores the on-chain address.
   * For extension attributes, use the full name:
   * 'extension_<appId>_vaultfireAddress'
   * Defaults to checking tags with prefix 'vaultfire:'.
   */
  onChainAddressAttribute?: string;
  /**
   * Service principal types to include.
   * Defaults to ['Application', 'ManagedIdentity'].
   */
  agentPrincipalTypes?: string[];
  /**
   * OData filter for the /servicePrincipals Graph API call.
   */
  filter?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AzureAdapter implementation
// ─────────────────────────────────────────────────────────────────────────────

export class AzureAdapter implements IamAdapter {
  readonly providerName = 'Azure AD';

  private readonly client: AzureGraphClientLike;
  private readonly onChainAddressAttribute: string;
  private readonly agentPrincipalTypes: string[];
  private readonly filter?: string;

  constructor(client: AzureGraphClientLike, config: AzureAdapterConfig = {}) {
    this.client = client;
    this.onChainAddressAttribute =
      config.onChainAddressAttribute ?? 'vaultfireAddress';
    this.agentPrincipalTypes = config.agentPrincipalTypes ?? [
      'Application',
      'ManagedIdentity',
    ];
    this.filter = config.filter;
  }

  async listAgentRecords(): Promise<IamAgentRecord[]> {
    const apiCall = this.filter
      ? this.client.api('/servicePrincipals').filter(this.filter)
      : (this.client.api('/servicePrincipals') as { get(): Promise<AzureGraphResponse<AzureServicePrincipal>> });

    const response = await apiCall.get();
    return response.value.map((sp) => this.principalToRecord(sp));
  }

  extractOnChainAddress(record: IamAgentRecord): string | undefined {
    // Check extension attribute
    const attr = record.attributes[this.onChainAddressAttribute];
    if (typeof attr === 'string' && ethers.isAddress(attr)) {
      return ethers.getAddress(attr);
    }

    // Check tags array for 'vaultfire:0x...' pattern
    const tags = record.attributes['tags'];
    if (Array.isArray(tags)) {
      for (const tag of tags as string[]) {
        const match = /^vaultfire:(.+)$/i.exec(tag);
        if (match && match[1] && ethers.isAddress(match[1])) {
          return ethers.getAddress(match[1]);
        }
      }
    }

    return undefined;
  }

  isAgentRecord(record: IamAgentRecord): boolean {
    return this.agentPrincipalTypes.some(
      (t) => t.toLowerCase() === record.type.toLowerCase(),
    );
  }

  buildMapping(record: IamAgentRecord, onChainAddress: string): AgentMapping {
    return {
      enterpriseId: record.id,
      onChainAddress: ethers.getAddress(onChainAddress),
      iamProvider: this.providerName,
      mappedAt: new Date(),
      metadata: {
        displayName: record.name,
        appId: record.attributes['appId'],
        servicePrincipalType: record.type,
        tags: record.attributes['tags'],
      },
    };
  }

  private principalToRecord(sp: AzureServicePrincipal): IamAgentRecord {
    const onChainAddress = this.extractOnChainAddressFromPrincipal(sp);
    return {
      id: sp.id,
      name: sp.displayName,
      type: sp.servicePrincipalType,
      provider: this.providerName,
      onChainAddress,
      attributes: sp as unknown as Record<string, unknown>,
    };
  }

  private extractOnChainAddressFromPrincipal(
    sp: AzureServicePrincipal,
  ): string | undefined {
    // Check extension attribute
    const attr = sp[this.onChainAddressAttribute];
    if (typeof attr === 'string' && ethers.isAddress(attr)) {
      return ethers.getAddress(attr);
    }

    // Check tags
    if (Array.isArray(sp.tags)) {
      for (const tag of sp.tags) {
        const match = /^vaultfire:(.+)$/i.exec(tag);
        if (match && match[1] && ethers.isAddress(match[1])) {
          return ethers.getAddress(match[1]);
        }
      }
    }

    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an AzureAdapter using Azure credentials from environment variables.
 *
 * Requires @azure/identity and @microsoft/microsoft-graph-client installed.
 * SECURITY: reads AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET from env.
 */
export function createAzureAdapterFromEnv(
  config: AzureAdapterConfig = {},
): AzureAdapter {
  const tenantId = process.env['AZURE_TENANT_ID'];
  const clientId = process.env['AZURE_CLIENT_ID'];
  const clientSecret = process.env['AZURE_CLIENT_SECRET'];

  if (!tenantId) throw new Error('AZURE_TENANT_ID environment variable is not set.');
  if (!clientId) throw new Error('AZURE_CLIENT_ID environment variable is not set.');
  if (!clientSecret)
    throw new Error('AZURE_CLIENT_SECRET environment variable is not set.');

  type AzureIdentityMod = {
    ClientSecretCredential: new (t: string, c: string, s: string) => unknown;
  };
  type GraphClientMod = {
    Client: { initWithMiddleware(opts: { authProvider: unknown }): AzureGraphClientLike };
  };
  type AuthProviderMod = {
    TokenCredentialAuthenticationProvider: new (cred: unknown, opts: { scopes: string[] }) => unknown;
  };

  let azureIdentity: AzureIdentityMod;
  let graphClientMod: GraphClientMod;
  let authProviderMod: AuthProviderMod;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    azureIdentity = require('@azure/identity') as AzureIdentityMod;
  } catch {
    throw new Error('Please install @azure/identity: npm install @azure/identity');
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    graphClientMod = require('@microsoft/microsoft-graph-client') as GraphClientMod;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    authProviderMod = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials') as AuthProviderMod;
  } catch {
    throw new Error(
      'Please install @microsoft/microsoft-graph-client: npm install @microsoft/microsoft-graph-client',
    );
  }

  const credential = new azureIdentity.ClientSecretCredential(tenantId, clientId, clientSecret);
  const authProvider = new authProviderMod.TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });
  const graphClient = graphClientMod.Client.initWithMiddleware({ authProvider });

  return new AzureAdapter(graphClient, config);
}
