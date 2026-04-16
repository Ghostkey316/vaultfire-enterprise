/**
 * @vaultfire/enterprise — Cross-Chain Agent Audit Example
 *
 * Scans an agent's on-chain trust across all 4 Vaultfire chains:
 * Base, Avalanche, Arbitrum, and Polygon.
 *
 * Use this for compliance reporting or onboarding due diligence.
 *
 * Run: npx ts-node examples/cross-chain-audit.ts
 */

import { VaultfireEnterpriseClient } from '../src/index';

async function main() {
  const client = new VaultfireEnterpriseClient({ debug: false });

  // Agent to audit — replace with the address you're investigating
  const targetAgent = '0xA054f831B562e729F8D268291EBde1B2EDcFb84F';

  console.log('=== Vaultfire Enterprise — Cross-Chain Agent Audit ===\n');
  console.log(`Target Agent: ${targetAgent}`);
  console.log('Scanning all 4 Vaultfire chains...\n');

  const crossChain = await client.crossChainScan(targetAgent);

  console.log('--- Per-Chain Results ---');
  for (const chain of crossChain.chains) {
    const report = crossChain.reports[chain];
    const error = crossChain.errors[chain];

    if (error) {
      console.log(`  ${chain.padEnd(10)} ERROR: ${error}`);
      continue;
    }

    if (!report) {
      console.log(`  ${chain.padEnd(10)} No data`);
      continue;
    }

    const identity = report.hasIdentity ? '✓ Registered' : '✗ Not registered';
    const bonds = report.bondStatus.activeBonds.length;
    console.log(
      `  ${chain.padEnd(10)} Score: ${String(report.streetCred.score).padStart(2)}/95` +
        `  Tier: ${report.streetCred.tier.padEnd(8)}` +
        `  ${identity}` +
        `  Active bonds: ${bonds}`,
    );
  }

  console.log('\n--- Audit Summary ---');
  console.log(`  Best Score:     ${crossChain.bestScore}/95 (${crossChain.bestTier})`);
  console.log(
    `  Recognized on:  ${crossChain.recognizedOn.length > 0 ? crossChain.recognizedOn.join(', ') : 'none'}`,
  );
  console.log(`  Generated at:   ${crossChain.generatedAt}`);

  // Risk assessment
  console.log('\n--- Risk Assessment ---');
  if (crossChain.bestScore >= 76) {
    console.log('  RISK: LOW — Platinum tier agent with strong cross-chain presence.');
  } else if (crossChain.bestScore >= 56) {
    console.log('  RISK: MEDIUM-LOW — Gold tier agent.');
  } else if (crossChain.bestScore >= 31) {
    console.log('  RISK: MEDIUM — Silver tier. Consider additional verification.');
  } else if (crossChain.bestScore >= 1) {
    console.log('  RISK: HIGH — Bronze tier. Minimal trust established.');
  } else {
    console.log('  RISK: VERY HIGH — No on-chain trust found on any chain.');
    console.log(
      '  RECOMMENDATION: Request agent registration before any interaction.',
    );
  }

  // Batch audit of multiple agents
  console.log('\n--- Batch Audit (multiple agents) ---');
  const agents = [
    '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
    '0x35978DB675576598F0781dA2133E94cdCf4858bC',
  ];

  const batchReports = await client.batchVerify(agents, { chain: 'base' });
  batchReports.forEach((r, i) => {
    console.log(
      `  Agent ${i + 1}: ${r.address.slice(0, 10)}...  Score: ${r.streetCred.score}  Tier: ${r.streetCred.tier}`,
    );
  });
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
