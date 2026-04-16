/**
 * @vaultfire/enterprise — Basic Agent Verification Example
 *
 * Demonstrates a simple trust check for an external agent before
 * initiating any interaction.
 *
 * Run: npx ts-node examples/basic-verification.ts
 */

import { VaultfireEnterpriseClient, POLICIES } from '../src/index';

async function main() {
  // Initialize client — defaults to Base chain
  const client = new VaultfireEnterpriseClient({
    primaryChain: 'base',
    debug: true,
  });

  // The external agent address you received from your counterpart
  const externalAgentAddress = '0xA054f831B562e729F8D268291EBde1B2EDcFb84F';

  console.log('=== Vaultfire Enterprise — Basic Verification ===\n');
  console.log(`Checking trust for agent: ${externalAgentAddress}`);

  // 1. Simple trust report
  const report = await client.verifyExternalAgent(externalAgentAddress);

  console.log('\n--- Trust Report ---');
  console.log(`Address:      ${report.address}`);
  console.log(`Chain:        ${report.chain}`);
  console.log(`Has Identity: ${report.hasIdentity}`);
  console.log(`Street Cred:  ${report.streetCred.score}/95 (${report.streetCred.tier})`);
  console.log(`Active Bonds: ${report.bondStatus.activeBonds.length}`);
  console.log(`Has Identity: ${report.hasIdentity}`);

  if (report.identity) {
    console.log('\n--- On-Chain Identity ---');
    console.log(`  URI:          ${report.identity.agentURI}`);
    console.log(`  Type:         ${report.identity.agentType}`);
    console.log(`  Registered:   ${report.identity.registeredAt.toISOString()}`);
    console.log(`  Active:       ${report.identity.active}`);
  }

  console.log('\n--- Street Cred Breakdown ---');
  const { breakdown } = report.streetCred;
  console.log(`  Identity score:     ${breakdown.identityScore}/30`);
  console.log(`  Bond score:         ${breakdown.bondScore}/25`);
  console.log(`  Active bond score:  ${breakdown.activeBondScore}/15`);
  console.log(`  Bond tier bonus:    ${breakdown.bondTierBonus}/20`);
  console.log(`  Multiple bonds:     ${breakdown.multipleBondsScore}/5`);

  // 2. Check against the basic policy
  const policyResult = await client.meetsPolicy(externalAgentAddress, POLICIES.basic);

  console.log('\n--- Policy Check (basic) ---');
  console.log(`Passes: ${policyResult.passes}`);

  if (!policyResult.passes) {
    console.log('Violations:');
    for (const v of policyResult.violations) {
      console.log(`  [${v.rule}] ${v.message}`);
    }
  }

  // 3. Decision
  if (policyResult.passes) {
    console.log('\n✓ Agent cleared for basic interactions.');
  } else {
    console.log('\n✗ Agent does not meet minimum trust requirements.');
    console.log(
      `  Required: Street Cred >= 1 (${POLICIES.basic.minStreetCred}) and identity registered.`,
    );
    console.log(`  Actual:   Street Cred = ${report.streetCred.score}`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
