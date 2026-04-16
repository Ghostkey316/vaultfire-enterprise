/**
 * Tests for src/client.ts — VaultfireEnterpriseClient
 *
 * All on-chain calls are mocked via jest.mock to avoid live RPC calls.
 */

import { VaultfireEnterpriseClient } from '../src/client';
import { POLICIES } from '../src/policies';
import type { TrustReport } from '../src/types';

// ─────────────────────────────────────────────────────────────────────────────
// Mock ethers to avoid live RPC calls
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('ethers', () => {
  const actual = jest.requireActual<typeof import('ethers')>('ethers');

  // Minimal mock contract that returns "no identity" for getAgent
  const mockContract = {
    getAgent: jest.fn().mockResolvedValue(['', false, '', 0n]),
    getBondsByParticipant: jest.fn().mockResolvedValue([]),
    getReputation: jest.fn().mockResolvedValue([0n, 0n, 0n, 0n]),
    getBond: jest.fn().mockResolvedValue(['0x0', '0x0', '', 0n, false, 0n]),
  };

  return {
    ...actual,
    // Mock both the namespace object and named exports
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
      Contract: jest.fn().mockImplementation(() => mockContract),
    },
    JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
    Contract: jest.fn().mockImplementation(() => mockContract),
  };
});

const VALID_ADDRESS = '0xA054f831B562e729F8D268291EBde1B2EDcFb84F';
const VALID_ADDRESS_2 = '0x35978DB675576598F0781dA2133E94cdCf4858bC';

// ─────────────────────────────────────────────────────────────────────────────
// Constructor & config
// ─────────────────────────────────────────────────────────────────────────────

describe('VaultfireEnterpriseClient — constructor', () => {
  it('creates a client with default config', () => {
    const client = new VaultfireEnterpriseClient();
    expect(client).toBeInstanceOf(VaultfireEnterpriseClient);
  });

  it('accepts custom primaryChain', () => {
    const client = new VaultfireEnterpriseClient({ primaryChain: 'avalanche' });
    expect(client).toBeInstanceOf(VaultfireEnterpriseClient);
  });

  it('accepts debug mode', () => {
    const client = new VaultfireEnterpriseClient({ debug: true });
    expect(client).toBeInstanceOf(VaultfireEnterpriseClient);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapAgent
// ─────────────────────────────────────────────────────────────────────────────

describe('VaultfireEnterpriseClient — mapAgent', () => {
  it('creates a valid agent mapping', async () => {
    const client = new VaultfireEnterpriseClient({ iamProvider: 'okta' });
    const mapping = await client.mapAgent('okta-user-001', VALID_ADDRESS);

    expect(mapping.enterpriseId).toBe('okta-user-001');
    expect(mapping.onChainAddress).toBe(VALID_ADDRESS);
    expect(mapping.iamProvider).toBe('okta');
    expect(mapping.mappedAt).toBeInstanceOf(Date);
  });

  it('throws for invalid Ethereum address', async () => {
    const client = new VaultfireEnterpriseClient();
    await expect(client.mapAgent('agent-1', 'not-an-address')).rejects.toThrow(
      'Invalid Ethereum address',
    );
  });

  it('stores and retrieves a mapping', async () => {
    const client = new VaultfireEnterpriseClient();
    await client.mapAgent('agent-abc', VALID_ADDRESS);
    const retrieved = client.getMapping('agent-abc');
    expect(retrieved?.onChainAddress).toBe(VALID_ADDRESS);
  });

  it('returns undefined for unknown enterprise ID', () => {
    const client = new VaultfireEnterpriseClient();
    expect(client.getMapping('nonexistent')).toBeUndefined();
  });

  it('lists all stored mappings', async () => {
    const client = new VaultfireEnterpriseClient();
    await client.mapAgent('agent-1', VALID_ADDRESS);
    await client.mapAgent('agent-2', VALID_ADDRESS_2);
    const mappings = client.listMappings();
    expect(mappings).toHaveLength(2);
  });

  it('stores optional metadata', async () => {
    const client = new VaultfireEnterpriseClient();
    const mapping = await client.mapAgent('agent-meta', VALID_ADDRESS, {
      department: 'Engineering',
      role: 'AI orchestrator',
    });
    expect(mapping.metadata?.department).toBe('Engineering');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyExternalAgent
// ─────────────────────────────────────────────────────────────────────────────

describe('VaultfireEnterpriseClient — verifyExternalAgent', () => {
  it('returns a TrustReport for a valid address', async () => {
    const client = new VaultfireEnterpriseClient();
    const report = await client.verifyExternalAgent(VALID_ADDRESS);

    expect(report).toBeDefined();
    expect(report.address).toBe(VALID_ADDRESS);
    expect(report.chain).toBe('base');
    expect(report.streetCred).toBeDefined();
    expect(report.streetCred.score).toBeGreaterThanOrEqual(0);
    expect(report.generatedAt).toBeDefined();
  });

  it('returns hasIdentity false when agent not registered', async () => {
    const client = new VaultfireEnterpriseClient();
    const report = await client.verifyExternalAgent(VALID_ADDRESS);
    // Mock returns empty string for agentURI → not registered
    expect(report.hasIdentity).toBe(false);
  });

  it('returns empty bondStatus when no bonds', async () => {
    const client = new VaultfireEnterpriseClient();
    const report = await client.verifyExternalAgent(VALID_ADDRESS);
    expect(report.bondStatus.bonds).toHaveLength(0);
    expect(report.bondStatus.hasActiveBond).toBe(false);
  });

  it('returns score 0 for unregistered agent', async () => {
    const client = new VaultfireEnterpriseClient();
    const report = await client.verifyExternalAgent(VALID_ADDRESS);
    expect(report.streetCred.score).toBe(0);
    expect(report.streetCred.tier).toBe('None');
  });

  it('throws for an invalid address', async () => {
    const client = new VaultfireEnterpriseClient();
    await expect(client.verifyExternalAgent('bad-address')).rejects.toThrow(
      'Invalid Ethereum address',
    );
  });

  it('respects chain option', async () => {
    const client = new VaultfireEnterpriseClient();
    const report = await client.verifyExternalAgent(VALID_ADDRESS, {
      chain: 'avalanche',
    });
    expect(report.chain).toBe('avalanche');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStreetCred
// ─────────────────────────────────────────────────────────────────────────────

describe('VaultfireEnterpriseClient — getStreetCred', () => {
  it('returns a StreetCred object', async () => {
    const client = new VaultfireEnterpriseClient();
    const cred = await client.getStreetCred(VALID_ADDRESS);
    expect(cred.score).toBeDefined();
    expect(cred.tier).toBeDefined();
    expect(cred.breakdown).toBeDefined();
    expect(cred.computedAt).toBeInstanceOf(Date);
  });

  it('returns tier None for unregistered agent', async () => {
    const client = new VaultfireEnterpriseClient();
    const cred = await client.getStreetCred(VALID_ADDRESS);
    expect(cred.tier).toBe('None');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkBondStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('VaultfireEnterpriseClient — checkBondStatus', () => {
  it('returns BondStatus with no bonds for unregistered agents', async () => {
    const client = new VaultfireEnterpriseClient();
    const status = await client.checkBondStatus(VALID_ADDRESS, VALID_ADDRESS_2);
    expect(status.bonded).toBe(false);
    expect(status.bonds).toHaveLength(0);
  });

  it('throws for invalid agent1 address', async () => {
    const client = new VaultfireEnterpriseClient();
    await expect(
      client.checkBondStatus('bad-addr', VALID_ADDRESS_2),
    ).rejects.toThrow('Invalid address');
  });

  it('throws for invalid agent2 address', async () => {
    const client = new VaultfireEnterpriseClient();
    await expect(
      client.checkBondStatus(VALID_ADDRESS, 'bad-addr'),
    ).rejects.toThrow('Invalid address');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// batchVerify
// ─────────────────────────────────────────────────────────────────────────────

describe('VaultfireEnterpriseClient — batchVerify', () => {
  it('returns an array of TrustReports', async () => {
    const client = new VaultfireEnterpriseClient();
    const reports = await client.batchVerify([VALID_ADDRESS, VALID_ADDRESS_2]);
    expect(reports).toHaveLength(2);
    expect(reports[0].address).toBe(VALID_ADDRESS);
    expect(reports[1].address).toBe(VALID_ADDRESS_2);
  });

  it('returns empty array for empty input', async () => {
    const client = new VaultfireEnterpriseClient();
    const reports = await client.batchVerify([]);
    expect(reports).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// meetsPolicy
// ─────────────────────────────────────────────────────────────────────────────

describe('VaultfireEnterpriseClient — meetsPolicy', () => {
  it('returns a PolicyResult', async () => {
    const client = new VaultfireEnterpriseClient();
    const result = await client.meetsPolicy(VALID_ADDRESS, POLICIES.basic);
    expect(result).toBeDefined();
    expect(result.passes).toBeDefined();
    expect(result.violations).toBeDefined();
  });

  it('fails basic policy for unregistered agent', async () => {
    const client = new VaultfireEnterpriseClient();
    const result = await client.meetsPolicy(VALID_ADDRESS, POLICIES.basic);
    // Mocked contract returns empty URI = not registered → score 0 → fails basic (minStreetCred: 1)
    expect(result.passes).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// crossChainScan
// ─────────────────────────────────────────────────────────────────────────────

describe('VaultfireEnterpriseClient — crossChainScan', () => {
  it('returns a CrossChainReport with all 4 chains', async () => {
    const client = new VaultfireEnterpriseClient();
    const report = await client.crossChainScan(VALID_ADDRESS);
    expect(report.chains).toHaveLength(4);
    expect(report.chains).toContain('base');
    expect(report.chains).toContain('avalanche');
    expect(report.chains).toContain('arbitrum');
    expect(report.chains).toContain('polygon');
  });

  it('returns best score of 0 for unregistered agent', async () => {
    const client = new VaultfireEnterpriseClient();
    const report = await client.crossChainScan(VALID_ADDRESS);
    expect(report.bestScore).toBe(0);
  });

  it('throws for invalid address', async () => {
    const client = new VaultfireEnterpriseClient();
    await expect(client.crossChainScan('invalid')).rejects.toThrow(
      'Invalid Ethereum address',
    );
  });

  it('populates reports for all 4 chains', async () => {
    const client = new VaultfireEnterpriseClient();
    const report = await client.crossChainScan(VALID_ADDRESS);
    for (const chain of ['base', 'avalanche', 'arbitrum', 'polygon'] as const) {
      expect(report.reports[chain]).not.toBeUndefined();
    }
  });
});
