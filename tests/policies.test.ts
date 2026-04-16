/**
 * Tests for src/policies.ts — Policy evaluation engine.
 */

import {
  POLICIES,
  createPolicy,
  evaluatePolicy,
  getTier,
  meetsMinTier,
  tierToNumber,
} from '../src/policies';
import type { StreetCredTier, TrustReport } from '../src/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<{
  hasIdentity: boolean;
  score: number;
  tier: StreetCredTier;
  bonded: boolean;
  hasActiveBond: boolean;
  totalBondValue: string;
  chain: string;
}>): TrustReport {
  const {
    hasIdentity = true,
    score = 30,
    tier = 'Bronze',
    bonded = false,
    hasActiveBond = false,
    totalBondValue = '0',
    chain = 'base',
  } = overrides;

  return {
    address: '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
    chain: chain as TrustReport['chain'],
    hasIdentity,
    identity: hasIdentity
      ? {
          address: '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
          agentURI: 'ipfs://test',
          agentType: 'AI',
          active: true,
          registeredAt: new Date(),
          chain: chain as TrustReport['chain'],
        }
      : null,
    streetCred: {
      address: '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
      chain: chain as TrustReport['chain'],
      score,
      tier,
      breakdown: {
        identityScore: hasIdentity ? 30 : 0,
        bondScore: 0,
        activeBondScore: 0,
        bondTierBonus: 0,
        multipleBondsScore: 0,
      },
      computedAt: new Date(),
    },
    bondStatus: {
      agent1: '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
      agent2: '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
      chain: chain as TrustReport['chain'],
      bonded,
      bonds: bonded ? [{ bondId: '1', agent1: '0x1', agent2: '0x2', partnershipType: 'standard', value: totalBondValue, active: hasActiveBond, createdAt: new Date(), chain: chain as TrustReport['chain'] }] : [],
      activeBonds: hasActiveBond ? [{ bondId: '1', agent1: '0x1', agent2: '0x2', partnershipType: 'standard', value: totalBondValue, active: true, createdAt: new Date(), chain: chain as TrustReport['chain'] }] : [],
      totalBondValue,
      hasActiveBond,
    },
    reputation: null,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('getTier', () => {
  it('returns None for score 0', () => {
    expect(getTier(0)).toBe('None');
  });

  it('returns Bronze for score 1', () => {
    expect(getTier(1)).toBe('Bronze');
  });

  it('returns Bronze for score 30', () => {
    expect(getTier(30)).toBe('Bronze');
  });

  it('returns Silver for score 31', () => {
    expect(getTier(31)).toBe('Silver');
  });

  it('returns Silver for score 55', () => {
    expect(getTier(55)).toBe('Silver');
  });

  it('returns Gold for score 56', () => {
    expect(getTier(56)).toBe('Gold');
  });

  it('returns Gold for score 75', () => {
    expect(getTier(75)).toBe('Gold');
  });

  it('returns Platinum for score 76', () => {
    expect(getTier(76)).toBe('Platinum');
  });

  it('returns Platinum for max score 95', () => {
    expect(getTier(95)).toBe('Platinum');
  });
});

describe('tierToNumber', () => {
  it('ranks tiers correctly', () => {
    expect(tierToNumber('None')).toBeLessThan(tierToNumber('Bronze'));
    expect(tierToNumber('Bronze')).toBeLessThan(tierToNumber('Silver'));
    expect(tierToNumber('Silver')).toBeLessThan(tierToNumber('Gold'));
    expect(tierToNumber('Gold')).toBeLessThan(tierToNumber('Platinum'));
  });
});

describe('meetsMinTier', () => {
  it('passes when actual equals required', () => {
    expect(meetsMinTier('Silver', 'Silver')).toBe(true);
  });

  it('passes when actual exceeds required', () => {
    expect(meetsMinTier('Gold', 'Silver')).toBe(true);
    expect(meetsMinTier('Platinum', 'Bronze')).toBe(true);
  });

  it('fails when actual is below required', () => {
    expect(meetsMinTier('Bronze', 'Silver')).toBe(false);
    expect(meetsMinTier('None', 'Bronze')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pre-built policies existence
// ─────────────────────────────────────────────────────────────────────────────

describe('POLICIES', () => {
  it('exports basic, standard, sensitive, critical policies', () => {
    expect(POLICIES.basic).toBeDefined();
    expect(POLICIES.standard).toBeDefined();
    expect(POLICIES.sensitive).toBeDefined();
    expect(POLICIES.critical).toBeDefined();
  });

  it('basic policy has minStreetCred = 1', () => {
    expect(POLICIES.basic.minStreetCred).toBe(1);
  });

  it('standard policy has minStreetCred = 31 and requireBond', () => {
    expect(POLICIES.standard.minStreetCred).toBe(31);
    expect(POLICIES.standard.requireBond).toBe(true);
  });

  it('sensitive policy requires active bond', () => {
    expect(POLICIES.sensitive.requireActiveBond).toBe(true);
  });

  it('critical policy has minBondValue = 0.01', () => {
    expect(POLICIES.critical.minBondValue).toBe('0.01');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createPolicy
// ─────────────────────────────────────────────────────────────────────────────

describe('createPolicy', () => {
  it('creates a policy with the given name and rules', () => {
    const policy = createPolicy('test', 'Test policy', {
      minStreetCred: 50,
      requireIdentity: true,
    });
    expect(policy.name).toBe('test');
    expect(policy.minStreetCred).toBe(50);
    expect(policy.requireIdentity).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluatePolicy
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluatePolicy — basic policy', () => {
  it('passes for a registered agent with score >= 1', () => {
    const report = makeReport({ hasIdentity: true, score: 30, tier: 'Bronze' });
    const result = evaluatePolicy(report, POLICIES.basic);
    expect(result.passes).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails for an unregistered agent', () => {
    const report = makeReport({ hasIdentity: false, score: 0, tier: 'None' });
    const result = evaluatePolicy(report, POLICIES.basic);
    expect(result.passes).toBe(false);
    expect(result.violations.some((v) => v.rule === 'requireIdentity')).toBe(true);
  });

  it('fails for score 0 (no identity)', () => {
    const report = makeReport({ hasIdentity: false, score: 0, tier: 'None' });
    const result = evaluatePolicy(report, POLICIES.basic);
    expect(result.passes).toBe(false);
  });
});

describe('evaluatePolicy — standard policy', () => {
  it('passes for Silver-tier bonded agent', () => {
    const report = makeReport({ hasIdentity: true, score: 45, tier: 'Silver', bonded: true });
    const result = evaluatePolicy(report, POLICIES.standard);
    expect(result.passes).toBe(true);
  });

  it('fails when no bond', () => {
    const report = makeReport({ hasIdentity: true, score: 45, tier: 'Silver', bonded: false });
    const result = evaluatePolicy(report, POLICIES.standard);
    expect(result.passes).toBe(false);
    expect(result.violations.some((v) => v.rule === 'requireBond')).toBe(true);
  });

  it('fails when score below 31', () => {
    const report = makeReport({ hasIdentity: true, score: 20, tier: 'Bronze', bonded: true });
    const result = evaluatePolicy(report, POLICIES.standard);
    expect(result.passes).toBe(false);
    expect(result.violations.some((v) => v.rule === 'minStreetCred')).toBe(true);
  });
});

describe('evaluatePolicy — sensitive policy', () => {
  it('passes for Gold-tier agent with active bond', () => {
    const report = makeReport({ hasIdentity: true, score: 65, tier: 'Gold', bonded: true, hasActiveBond: true });
    const result = evaluatePolicy(report, POLICIES.sensitive);
    expect(result.passes).toBe(true);
  });

  it('fails when no active bond', () => {
    const report = makeReport({ hasIdentity: true, score: 65, tier: 'Gold', bonded: true, hasActiveBond: false });
    const result = evaluatePolicy(report, POLICIES.sensitive);
    expect(result.passes).toBe(false);
    expect(result.violations.some((v) => v.rule === 'requireActiveBond')).toBe(true);
  });
});

describe('evaluatePolicy — critical policy', () => {
  it('passes for Platinum agent with active bond and 0.05 ETH', () => {
    const report = makeReport({
      hasIdentity: true,
      score: 80,
      tier: 'Platinum',
      bonded: true,
      hasActiveBond: true,
      totalBondValue: '0.05',
    });
    const result = evaluatePolicy(report, POLICIES.critical);
    expect(result.passes).toBe(true);
  });

  it('fails when bond value is too low', () => {
    const report = makeReport({
      hasIdentity: true,
      score: 80,
      tier: 'Platinum',
      bonded: true,
      hasActiveBond: true,
      totalBondValue: '0.005',
    });
    const result = evaluatePolicy(report, POLICIES.critical);
    expect(result.passes).toBe(false);
    expect(result.violations.some((v) => v.rule === 'minBondValue')).toBe(true);
  });
});

describe('evaluatePolicy — chain restriction', () => {
  it('fails when chain not in allowedChains', () => {
    const policy = createPolicy('chain-test', 'Chain test', {
      allowedChains: ['base', 'avalanche'],
    });
    const report = makeReport({ chain: 'polygon' });
    const result = evaluatePolicy(report, policy);
    expect(result.passes).toBe(false);
    expect(result.violations.some((v) => v.rule === 'allowedChains')).toBe(true);
  });

  it('passes when chain is in allowedChains', () => {
    const policy = createPolicy('chain-test', 'Chain test', {
      allowedChains: ['base', 'polygon'],
    });
    const report = makeReport({ chain: 'polygon', hasIdentity: false });
    const result = evaluatePolicy(report, policy);
    // Should not have chain violation, but may fail other rules
    expect(result.violations.every((v) => v.rule !== 'allowedChains')).toBe(true);
  });
});

describe('evaluatePolicy — custom validator', () => {
  it('fails when customValidator returns false', () => {
    const policy = createPolicy('custom', 'Custom', {
      customValidator: () => false,
    });
    const report = makeReport({ hasIdentity: true, score: 90, tier: 'Platinum' });
    const result = evaluatePolicy(report, policy);
    expect(result.passes).toBe(false);
    expect(result.violations.some((v) => v.rule === 'customValidator')).toBe(true);
  });

  it('passes when customValidator returns true', () => {
    const policy = createPolicy('custom', 'Custom', {
      customValidator: () => true,
    });
    const report = makeReport({ hasIdentity: true, score: 90, tier: 'Platinum' });
    const result = evaluatePolicy(report, policy);
    expect(result.passes).toBe(true);
  });
});
