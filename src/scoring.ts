/**
 * @vaultfire/enterprise — Street Cred Scoring
 * Implements the Vaultfire Street Cred scoring algorithm.
 *
 * Formula:
 *   Identity Registered: 30/30 pts
 *   Has Bond:            0-25 pts
 *   Bond Active:         0-15 pts
 *   Bond Tier Bonus:     0-20 pts
 *   Multiple Bonds:      0-5 pts
 *   Total:               0-95 pts
 *
 * Tiers: None (0), Bronze (1-30), Silver (31-55), Gold (56-75), Platinum (76-95)
 */

import type { StreetCred, StreetCredTier, SupportedChain } from './types';

export interface ScoringInput {
  address: string;
  chain: SupportedChain;
  isRegistered: boolean;
  bondCount: number;
  activeBondCount: number;
  /** Total bond value in wei (as bigint) */
  totalBondValueWei: bigint;
}

const TIER_THRESHOLDS: Array<{ min: number; max: number; tier: StreetCredTier }> = [
  { min: 0, max: 0, tier: 'None' },
  { min: 1, max: 30, tier: 'Bronze' },
  { min: 31, max: 55, tier: 'Silver' },
  { min: 56, max: 75, tier: 'Gold' },
  { min: 76, max: 95, tier: 'Platinum' },
];

export function getTier(score: number): StreetCredTier {
  for (const { min, max, tier } of TIER_THRESHOLDS) {
    if (score >= min && score <= max) return tier;
  }
  return 'None';
}

export function computeStreetCred(input: ScoringInput): StreetCred {
  const { address, chain, isRegistered, bondCount, activeBondCount, totalBondValueWei } = input;

  // Identity score: 30 if registered, 0 otherwise
  const identityScore = isRegistered ? 30 : 0;

  // Bond score: 0-25 pts based on having bonds
  let bondScore = 0;
  if (bondCount >= 1) bondScore = 15;
  if (bondCount >= 3) bondScore = 20;
  if (bondCount >= 5) bondScore = 25;

  // Active bond score: 0-15 pts
  let activeBondScore = 0;
  if (activeBondCount >= 1) activeBondScore = 10;
  if (activeBondCount >= 2) activeBondScore = 15;

  // Bond tier bonus: 0-20 pts based on total bond value
  // Using ETH thresholds: 0.001 ETH = 5pts, 0.01 ETH = 10pts, 0.1 ETH = 15pts, 1 ETH = 20pts
  let bondTierBonus = 0;
  const ethValue = Number(totalBondValueWei) / 1e18;
  if (ethValue >= 0.001) bondTierBonus = 5;
  if (ethValue >= 0.01) bondTierBonus = 10;
  if (ethValue >= 0.1) bondTierBonus = 15;
  if (ethValue >= 1.0) bondTierBonus = 20;

  // Multiple bonds bonus: 0-5 pts
  let multipleBondsScore = 0;
  if (bondCount >= 2) multipleBondsScore = 3;
  if (bondCount >= 4) multipleBondsScore = 5;

  const score = identityScore + bondScore + activeBondScore + bondTierBonus + multipleBondsScore;
  const tier = getTier(score);

  return {
    address,
    chain,
    score,
    tier,
    breakdown: {
      identityScore,
      bondScore,
      activeBondScore,
      bondTierBonus,
      multipleBondsScore,
    },
    computedAt: new Date(),
  };
}

export function tierToNumber(tier: StreetCredTier): number {
  const map: Record<StreetCredTier, number> = {
    None: 0,
    Bronze: 1,
    Silver: 2,
    Gold: 3,
    Platinum: 4,
  };
  return map[tier];
}

export function meetsMinTier(actual: StreetCredTier, required: StreetCredTier): boolean {
  return tierToNumber(actual) >= tierToNumber(required);
}
