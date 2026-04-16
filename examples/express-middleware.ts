/**
 * @vaultfire/enterprise — Express Middleware Example
 *
 * A complete Express API server with Vaultfire trust gates protecting
 * different routes at different trust levels.
 *
 * PREREQUISITES: npm install express @types/express
 * Run: npx ts-node examples/express-middleware.ts
 *
 * Test with:
 *   curl -H "x-agent-address: 0xA054f831B562e729F8D268291EBde1B2EDcFb84F" \
 *        http://localhost:3000/api/public
 *
 *   curl -H "x-agent-address: 0xA054f831B562e729F8D268291EBde1B2EDcFb84F" \
 *        http://localhost:3000/api/sensitive
 */

// NOTE: This example requires 'express' to be installed separately.
// This package does not include express as a dependency to keep it lightweight.
// import express from 'express';

import {
  VaultfireEnterpriseClient,
  POLICIES,
  vaultfireTrustGate,
  createPolicy,
} from '../src/index';

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

const client = new VaultfireEnterpriseClient({
  primaryChain: 'base',
  debug: false,
});

// Custom policy for your specific use case
const financialApiPolicy = createPolicy(
  'financial-api',
  'Required for accessing financial data endpoints',
  {
    minStreetCred: 60,
    requireIdentity: true,
    requireActiveBond: true,
    minBondValue: '0.005',
    allowedChains: ['base', 'arbitrum'],
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Express server setup (pseudo-code — requires express to be installed)
// ─────────────────────────────────────────────────────────────────────────────

export function createApp() {
  /**
   * In a real application, initialize Express here:
   *
   * const app = express();
   * app.use(express.json());
   *
   * // Public route — no trust gate
   * app.get('/api/public', (req, res) => {
   *   res.json({ message: 'Public endpoint — no trust required.' });
   * });
   *
   * // Basic trust gate — Bronze tier or above
   * app.get('/api/agents',
   *   vaultfireTrustGate(client, POLICIES.basic),
   *   (req, res) => {
   *     res.json({ agents: [] });
   *   }
   * );
   *
   * // Standard trust gate — Silver tier, must have bond
   * app.post('/api/data/exchange',
   *   vaultfireTrustGate(client, POLICIES.standard, { attachReport: true }),
   *   (req, res) => {
   *     const { vaultfireTrust } = req as any;
   *     res.json({
   *       message: 'Data exchange authorized',
   *       agentScore: vaultfireTrust.trustReport.streetCred.score,
   *     });
   *   }
   * );
   *
   * // Sensitive trust gate — Gold tier, active bond required
   * app.post('/api/sensitive',
   *   vaultfireTrustGate(client, POLICIES.sensitive, {
   *     rejectionMessage: 'This endpoint requires Gold-tier trust or above.',
   *   }),
   *   (req, res) => {
   *     res.json({ message: 'Sensitive operation authorized.' });
   *   }
   * );
   *
   * // Critical trust gate — Platinum tier, minimum bond value
   * app.post('/api/governance',
   *   vaultfireTrustGate(client, POLICIES.critical),
   *   (req, res) => {
   *     res.json({ message: 'Governance action authorized.' });
   *   }
   * );
   *
   * // Custom financial policy
   * app.get('/api/financial/transactions',
   *   vaultfireTrustGate(client, financialApiPolicy, {
   *     addressHeader: 'x-agent-address',
   *     chain: 'base',
   *     attachReport: true,
   *   }),
   *   (req, res) => {
   *     res.json({ transactions: [] });
   *   }
   * );
   *
   * // Error handler
   * app.use((err, req, res, next) => {
   *   console.error('Trust gate error:', err);
   *   res.status(500).json({ error: 'Internal trust verification error.' });
   * });
   *
   * return app;
   */

  // Return a configuration summary for documentation purposes
  return {
    routes: [
      { path: '/api/public', method: 'GET', policy: 'none', tier: 'Any' },
      { path: '/api/agents', method: 'GET', policy: 'basic', tier: 'Bronze+' },
      { path: '/api/data/exchange', method: 'POST', policy: 'standard', tier: 'Silver+' },
      { path: '/api/sensitive', method: 'POST', policy: 'sensitive', tier: 'Gold+' },
      { path: '/api/governance', method: 'POST', policy: 'critical', tier: 'Platinum' },
      { path: '/api/financial/transactions', method: 'GET', policy: 'financial-api', tier: 'Custom (60+)' },
    ],
    client,
    policies: {
      basic: POLICIES.basic,
      standard: POLICIES.standard,
      sensitive: POLICIES.sensitive,
      critical: POLICIES.critical,
      financialApiPolicy,
    },
    middleware: {
      vaultfireTrustGate,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main — display configuration
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const app = createApp();

  console.log('=== Vaultfire Express Middleware Example ===\n');
  console.log('Route → Trust Policy Mapping:');
  console.log('─'.repeat(65));

  for (const route of app.routes) {
    console.log(
      `  ${route.method.padEnd(6)} ${route.path.padEnd(35)} [${route.tier}]`,
    );
  }

  console.log('\nPolicy Details:');
  console.log('─'.repeat(65));
  for (const [name, policy] of Object.entries(app.policies)) {
    console.log(`  ${name}: minScore=${policy.minStreetCred ?? 'none'}, tier=${policy.minTier ?? 'any'}`);
  }

  console.log('\nTo start the server, install express and uncomment the app code.');
  console.log('  npm install express @types/express');
}

main();
