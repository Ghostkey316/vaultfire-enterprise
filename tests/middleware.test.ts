/**
 * Tests for src/middleware.ts — vaultfireTrustGate
 */

import { vaultfireTrustGate } from '../src/middleware';
import { POLICIES, createPolicy } from '../src/policies';
import { VaultfireEnterpriseClient } from '../src/client';
import type { TrustReport } from '../src/types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock helpers
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('ethers', () => {
  const actual = jest.requireActual<typeof import('ethers')>('ethers');
  const mockContract = {
    getAgent: jest.fn().mockResolvedValue(['', false, '', 0n]),
    getBondsByParticipant: jest.fn().mockResolvedValue([]),
    getReputation: jest.fn().mockResolvedValue([0n, 0n, 0n, 0n]),
    getBond: jest.fn().mockResolvedValue(['0x0', '0x0', '', 0n, false, 0n]),
  };
  return {
    ...actual,
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

// Minimal Express-like mocks
function mockReq(headers: Record<string, string> = {}): Record<string, unknown> {
  return { headers };
}

function mockRes(): {
  statusCode: number;
  body: unknown;
  status: (code: number) => ReturnType<typeof mockRes>;
  json: (body: unknown) => void;
} {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
  };
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Missing header
// ─────────────────────────────────────────────────────────────────────────────

describe('vaultfireTrustGate — missing address header', () => {
  it('returns 401 when address header is missing', async () => {
    const client = new VaultfireEnterpriseClient();
    const gate = vaultfireTrustGate(client, POLICIES.basic);
    const req = mockReq({});
    const res = mockRes();
    const next = jest.fn();

    await gate(req as never, res as never, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses custom addressHeader if specified', async () => {
    const client = new VaultfireEnterpriseClient();
    const gate = vaultfireTrustGate(client, POLICIES.basic, {
      addressHeader: 'x-custom-agent',
    });
    const req = mockReq({});
    const res = mockRes();
    const next = jest.fn();

    await gate(req as never, res as never, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Policy rejection
// ─────────────────────────────────────────────────────────────────────────────

describe('vaultfireTrustGate — policy failure', () => {
  it('returns 403 when agent fails basic policy (score 0)', async () => {
    const client = new VaultfireEnterpriseClient();
    const gate = vaultfireTrustGate(client, POLICIES.basic);
    const req = mockReq({ 'x-agent-address': VALID_ADDRESS });
    const res = mockRes();
    const next = jest.fn();

    await gate(req as never, res as never, next);

    // Unregistered agent → score 0 → fails basic (minStreetCred: 1)
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('includes violations in 403 response body', async () => {
    const client = new VaultfireEnterpriseClient();
    const gate = vaultfireTrustGate(client, POLICIES.basic);
    const req = mockReq({ 'x-agent-address': VALID_ADDRESS });
    const res = mockRes();
    const next = jest.fn();

    await gate(req as never, res as never, next);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('violations');
    expect(Array.isArray(body.violations)).toBe(true);
  });

  it('uses custom rejection message', async () => {
    const client = new VaultfireEnterpriseClient();
    const gate = vaultfireTrustGate(client, POLICIES.basic, {
      rejectionMessage: 'Custom rejection message',
    });
    const req = mockReq({ 'x-agent-address': VALID_ADDRESS });
    const res = mockRes();
    const next = jest.fn();

    await gate(req as never, res as never, next);

    const body = res.body as Record<string, unknown>;
    expect(body.message).toBe('Custom rejection message');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Policy pass — with a mock that returns identity
// ─────────────────────────────────────────────────────────────────────────────

describe('vaultfireTrustGate — policy pass', () => {
  it('calls next() when agent passes a custom policy with no requirements', async () => {
    const client = new VaultfireEnterpriseClient();
    const openPolicy = createPolicy('open', 'No restrictions', {});
    const gate = vaultfireTrustGate(client, openPolicy);
    const req = mockReq({ 'x-agent-address': VALID_ADDRESS });
    const res = mockRes();
    const next = jest.fn();

    await gate(req as never, res as never, next);

    expect(next).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(); // no error arg
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// attachReport option
// ─────────────────────────────────────────────────────────────────────────────

describe('vaultfireTrustGate — attachReport', () => {
  it('attaches vaultfireTrust to request when attachReport is true (open policy)', async () => {
    const client = new VaultfireEnterpriseClient();
    const openPolicy = createPolicy('open', 'No restrictions', {});
    const gate = vaultfireTrustGate(client, openPolicy, { attachReport: true });
    const req = mockReq({ 'x-agent-address': VALID_ADDRESS });
    const res = mockRes();
    const next = jest.fn();

    await gate(req as never, res as never, next);

    const trust = (req as Record<string, unknown>)['vaultfireTrust'] as {
      address: string;
      trustReport: TrustReport;
    };
    expect(trust).toBeDefined();
    expect(trust.address).toBe(VALID_ADDRESS);
    expect(trust.trustReport).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────────────────────

describe('vaultfireTrustGate — error propagation', () => {
  it('calls next(err) when verifyExternalAgent throws', async () => {
    const client = new VaultfireEnterpriseClient();
    // Force an error by providing an address that will throw in ethers.isAddress
    const gate = vaultfireTrustGate(client, POLICIES.basic);
    const req = mockReq({ 'x-agent-address': 'not-valid' });
    const res = mockRes();
    const next = jest.fn();

    await gate(req as never, res as never, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
