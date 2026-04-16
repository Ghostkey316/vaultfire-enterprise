/**
 * @vaultfire/enterprise — Enterprise Policy Gating Example
 *
 * Shows how to use pre-built and custom trust policies to gate
 * different tiers of agent-to-agent operations.
 *
 * Run: npx ts-node examples/enterprise-policy.ts
 */

import {
  VaultfireEnterpriseClient,
  POLICIES,
  createPolicy,
} from '../src/index';

async function checkPolicyGate(
  client: VaultfireEnterpriseClient,
  address: string,
  operationName: string,
  policyName: keyof typeof POLICIES,
) {
  const policy = POLICIES[policyName];
  const result = await client.meetsPolicy(address, policy);

  const symbol = result.passes ? '✓' : '✗';
  const status = result.passes ? 'ALLOWED' : 'DENIED';

  console.log(`  ${symbol} [${operationName}] → ${status}`);

  if (!result.passes) {
    for (const v of result.violations) {
      console.log(`      ↳ ${v.message}`);
    }
  }
}

async function main() {
  const client = new VaultfireEnterpriseClient({ primaryChain: 'base' });

  const agentAddress = '0xA054f831B562e729F8D268291EBde1B2EDcFb84F';

  console.log('=== Vaultfire Enterprise — Policy-Based Access Control ===\n');
  console.log(`Agent: ${agentAddress}\n`);

  // Get the trust report first so we can display the score
  const report = await client.verifyExternalAgent(agentAddress);
  console.log(
    `Street Cred: ${report.streetCred.score}/95 (${report.streetCred.tier})\n`,
  );

  console.log('--- Access Decisions ---');
  await checkPolicyGate(client, agentAddress, 'List agents (basic)', 'basic');
  await checkPolicyGate(client, agentAddress, 'Exchange data (standard)', 'standard');
  await checkPolicyGate(client, agentAddress, 'Access financial records (sensitive)', 'sensitive');
  await checkPolicyGate(client, agentAddress, 'Governance vote (critical)', 'critical');

  // Custom policy example
  console.log('\n--- Custom Policy Example ---');
  const aiOnlyPolicy = createPolicy(
    'ai-only',
    'Allow only verified AI agents from Base chain',
    {
      requireIdentity: true,
      minStreetCred: 30,
      allowedChains: ['base'],
      customValidator: (r) => r.identity?.agentType === 'AI' ?? false,
    },
  );

  const customResult = await client.meetsPolicy(agentAddress, aiOnlyPolicy);
  console.log(`  Custom AI-only policy: ${customResult.passes ? '✓ ALLOWED' : '✗ DENIED'}`);

  // Map enterprise agent before interaction
  console.log('\n--- IAM Mapping Example ---');
  const mapping = await client.mapAgent(
    'okta-service-account-001',
    agentAddress,
    { department: 'ML Platform', role: 'inference-agent' },
  );
  console.log(`  Mapped: ${mapping.enterpriseId} → ${mapping.onChainAddress}`);
  console.log(`  Provider: ${mapping.iamProvider}`);
  console.log(`  Department: ${String(mapping.metadata?.department)}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
