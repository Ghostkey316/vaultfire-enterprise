/**
 * @vaultfire/enterprise — Trust Policies
 *
 * Pre-built enterprise trust policies based on Vaultfire Street Cred tiers:
 *
 *   None    (0):     No trust established
 *   Bronze  (1-30):  Identity registered only
 *   Silver  (31-55): Identity + bond
 *   Gold    (56-75): Identity + active bond + value
 *   Platinum(76-95): Identity + multiple active bonds + significant value
 */

import type {
  PolicyResult,
  PolicyRules,
  PolicyViolation,
  TrustPolicy,
  TrustReport,
} from './types';
import { meetsMinTier, tierToNumber } from './scoring';

// ─────────────────────────────────────────────────────────────────────────────
// Pre-built policies
// ─────────────────────────────────────────────────────────────────────────────

export const POLICIES: Record<string, TrustPolicy> = {
  /**
   * Minimum for any interaction.
   * Requires: identity registered, Street Cred >= 1 (Bronze or above).
   */
  basic: {
    name: 'basic',
    description: 'Minimum trust for any agent interaction. Requires registered identity.',
    minStreetCred: 1,
    requireIdentity: true,
  },

  /**
   * Standard enterprise interactions (API calls, data exchange).
   * Requires: Silver tier (31+), identity, at least one bond.
   */
  standard: {
    name: 'standard',
    description:
      'Standard enterprise trust. Requires Silver tier Street Cred, registered identity, and a bond.',
    minStreetCred: 31,
    requireIdentity: true,
    requireBond: true,
    minTier: 'Silver',
  },

  /**
   * Sensitive operations (financial transactions, sensitive data access).
   * Requires: Gold tier (56+), identity, active bond.
   */
  sensitive: {
    name: 'sensitive',
    description:
      'Elevated trust for sensitive operations. Requires Gold tier, active bond.',
    minStreetCred: 56,
    requireIdentity: true,
    requireBond: true,
    requireActiveBond: true,
    minTier: 'Gold',
  },

  /**
   * Critical operations (governance votes, admin functions, large transfers).
   * Requires: Platinum tier (76+), identity, active bond, minimum bond value 0.01 ETH.
   */
  critical: {
    name: 'critical',
    description:
      'Maximum trust for critical operations. Requires Platinum tier, active bond with minimum 0.01 ETH value.',
    minStreetCred: 76,
    requireIdentity: true,
    requireBond: true,
    requireActiveBond: true,
    minBondValue: '0.01',
    minTier: 'Platinum',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Custom policy builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a custom trust policy with a name, description, and rules.
 */
export function createPolicy(
  name: string,
  description: string,
  rules: PolicyRules,
): TrustPolicy {
  return { name, description, ...rules };
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy evaluation engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a TrustReport against a TrustPolicy.
 * Returns a PolicyResult with a passes flag and detailed violations.
 */
export function evaluatePolicy(report: TrustReport, policy: TrustPolicy): PolicyResult {
  const violations: PolicyViolation[] = [];

  // 1. Identity check
  if (policy.requireIdentity && !report.hasIdentity) {
    violations.push({
      rule: 'requireIdentity',
      required: true,
      actual: false,
      message: `Agent ${report.address} has no registered on-chain identity.`,
    });
  }

  // 2. Minimum Street Cred score
  if (
    policy.minStreetCred !== undefined &&
    report.streetCred.score < policy.minStreetCred
  ) {
    violations.push({
      rule: 'minStreetCred',
      required: policy.minStreetCred,
      actual: report.streetCred.score,
      message: `Street Cred score ${report.streetCred.score} is below required minimum ${policy.minStreetCred}.`,
    });
  }

  // 3. Minimum tier
  if (policy.minTier !== undefined) {
    if (!meetsMinTier(report.streetCred.tier, policy.minTier)) {
      violations.push({
        rule: 'minTier',
        required: policy.minTier,
        actual: report.streetCred.tier,
        message: `Street Cred tier "${report.streetCred.tier}" is below required minimum "${policy.minTier}".`,
      });
    }
  }

  // 4. Bond presence
  if (policy.requireBond && !report.bondStatus.bonded) {
    violations.push({
      rule: 'requireBond',
      required: true,
      actual: false,
      message: `Agent ${report.address} has no bonds.`,
    });
  }

  // 5. Active bond
  if (policy.requireActiveBond && !report.bondStatus.hasActiveBond) {
    violations.push({
      rule: 'requireActiveBond',
      required: true,
      actual: false,
      message: `Agent ${report.address} has no active bonds.`,
    });
  }

  // 6. Minimum bond value
  if (policy.minBondValue !== undefined) {
    const required = parseFloat(policy.minBondValue);
    const actual = parseFloat(report.bondStatus.totalBondValue);
    if (actual < required) {
      violations.push({
        rule: 'minBondValue',
        required: policy.minBondValue,
        actual: report.bondStatus.totalBondValue,
        message: `Total bond value ${report.bondStatus.totalBondValue} ETH is below required minimum ${policy.minBondValue} ETH.`,
      });
    }
  }

  // 7. Allowed chains
  if (policy.allowedChains && policy.allowedChains.length > 0) {
    if (!policy.allowedChains.includes(report.chain)) {
      violations.push({
        rule: 'allowedChains',
        required: policy.allowedChains.join(', '),
        actual: report.chain,
        message: `Chain "${report.chain}" is not in allowed chains: ${policy.allowedChains.join(', ')}.`,
      });
    }
  }

  // 8. Custom validator
  if (policy.customValidator && !policy.customValidator(report)) {
    violations.push({
      rule: 'customValidator',
      required: true,
      actual: false,
      message: 'Custom policy validator returned false.',
    });
  }

  return {
    address: report.address,
    policy,
    passes: violations.length === 0,
    violations,
    trustReport: report,
    evaluatedAt: new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: check tier ranking
// ─────────────────────────────────────────────────────────────────────────────

export { meetsMinTier, tierToNumber, getTier } from './scoring';
