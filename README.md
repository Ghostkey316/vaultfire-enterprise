# @vaultfire/enterprise

> **Okta tells you WHO has access. Vaultfire tells you WHO is trustworthy.**

Bridge enterprise IAM systems (Okta, Azure AD, generic OIDC) with Vaultfire's on-chain agent identity and trust infrastructure — enabling cross-organizational agent trust without a centralized broker.

[![npm version](https://img.shields.io/npm/v/@vaultfire/enterprise)](https://www.npmjs.com/package/@vaultfire/enterprise)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

---

## The Problem

Modern enterprises manage agent identity through IAM platforms like Okta or Azure AD. These work well for **intra-org** access control. But when:

- **Agent A** (Company X, managed via Okta) needs to trust **Agent B** (Company Y, managed via Azure AD)
- Two AI agents from different organizations want to exchange sensitive data
- You need to verify that an external AI agent has real economic stake before granting it access

…there's no shared trust layer. Okta and Azure AD don't talk to each other, and neither has a mechanism for **cross-organizational, cryptoeconomic trust**.

## The Solution

Vaultfire provides the shared, on-chain trust layer. This package makes it trivial for enterprises to:

1. **Map** their IAM-managed agents to Vaultfire on-chain identities
2. **Verify** external agents' Street Cred before interacting
3. **Gate** API endpoints using trust policies tied to on-chain bond status
4. **Audit** agents across 4 blockchain networks simultaneously

---

## Architecture

```
  Your Enterprise (Company X)               External Agent (Company Y)
  ┌─────────────────────────┐               ┌─────────────────────────┐
  │   Okta / Azure AD       │               │   Any IAM / No IAM      │
  │   ┌──────────────────┐  │               │   ┌──────────────────┐  │
  │   │  Agent Identity  │  │               │   │  Agent Identity  │  │
  │   │  (enterprise ID) │  │               │   │  (on-chain addr) │  │
  │   └────────┬─────────┘  │               │   └────────┬─────────┘  │
  └────────────┼────────────┘               └────────────┼────────────┘
               │ mapAgent()                              │
               ▼                                         ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │                   @vaultfire/enterprise                            │
  │                                                                    │
  │   VaultfireEnterpriseClient                                        │
  │   ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
  │   │   mapAgent()    │  │ verifyExternal   │  │  vaultfireTrust │  │
  │   │   OktaAdapter   │  │   Agent()        │  │  Gate()         │  │
  │   │   AzureAdapter  │  │ meetsPolicy()    │  │  Express/Fastify│  │
  │   │   OidcAdapter   │  │ crossChainScan() │  │  middleware     │  │
  │   └─────────────────┘  └────────┬─────────┘  └─────────────────┘  │
  └─────────────────────────────────┼──────────────────────────────────┘
                                    │ ethers.js (read-only)
                                    ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │                 Vaultfire On-Chain Contracts                       │
  │                                                                    │
  │  Base (8453)          Avalanche (43114)                            │
  │  Identity Registry    Identity Registry                            │
  │  Partnership Bonds    Partnership Bonds                            │
  │  Reputation           Reputation                                   │
  │                                                                    │
  │  Arbitrum (42161)     Polygon (137)                                │
  │  Identity Registry    Identity Registry                            │
  │  Partnership Bonds    Partnership Bonds                            │
  │  Reputation           Reputation                                   │
  └────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
npm install @vaultfire/enterprise
```

```typescript
import { VaultfireEnterpriseClient, POLICIES } from '@vaultfire/enterprise';

const client = new VaultfireEnterpriseClient({ primaryChain: 'base' });
const result = await client.meetsPolicy('0xAGENT_ADDRESS', POLICIES.standard);
console.log(result.passes); // true / false
```

That's it. Three lines to verify an external agent's on-chain trustworthiness.

---

## Installation

```bash
npm install @vaultfire/enterprise
# ethers is a peer dependency
npm install ethers@^6
```

---

## Core Concepts

### Street Cred Score

Vaultfire's composite trust score, computed entirely from on-chain data:

| Component           | Points  | Description                              |
|---------------------|---------|------------------------------------------|
| Identity Registered | 0 or 30 | Is the agent registered on-chain?        |
| Has Bond            | 0–25    | Does the agent have a Partnership Bond?  |
| Bond Active         | 0–15    | Is at least one bond currently active?   |
| Bond Tier Bonus     | 0–20    | Based on total bond value (ETH)          |
| Multiple Bonds      | 0–5     | Bonus for having 2+ bonds                |
| **Total**           | **0–95**| —                                        |

**Tiers:**

| Tier     | Score Range | Use Case                               |
|----------|-------------|----------------------------------------|
| None     | 0           | No trust established                   |
| Bronze   | 1–30        | Identity only — minimal interactions   |
| Silver   | 31–55       | Standard enterprise integrations       |
| Gold     | 56–75       | Sensitive data access, financial ops   |
| Platinum | 76–95       | Governance, admin, critical operations |

---

## Usage

### Client Setup

```typescript
import { VaultfireEnterpriseClient } from '@vaultfire/enterprise';

const client = new VaultfireEnterpriseClient({
  primaryChain: 'base',        // 'base' | 'avalanche' | 'arbitrum' | 'polygon'
  iamProvider: 'okta',         // optional — for agent mapping context
  debug: false,                // enable verbose logs
  timeout: 10_000,             // RPC timeout in ms
  // Override RPC endpoints (optional)
  rpcUrls: {
    base: process.env.BASE_RPC_URL,
  },
});
```

### Verify an External Agent

```typescript
const report = await client.verifyExternalAgent('0xAGENT_ADDRESS');

console.log(report.streetCred.score);   // e.g. 65
console.log(report.streetCred.tier);    // e.g. 'Gold'
console.log(report.hasIdentity);        // true
console.log(report.bondStatus.hasActiveBond); // true
```

### Policy-Based Access Control

```typescript
import { POLICIES, createPolicy } from '@vaultfire/enterprise';

// Use pre-built policies
const result = await client.meetsPolicy('0xAGENT_ADDRESS', POLICIES.sensitive);

if (!result.passes) {
  console.log(result.violations);
  // [{ rule: 'requireActiveBond', message: 'Agent has no active bonds.' }]
}

// Build a custom policy
const myPolicy = createPolicy('my-policy', 'Custom requirements', {
  minStreetCred: 50,
  requireIdentity: true,
  requireActiveBond: true,
  allowedChains: ['base', 'arbitrum'],
  customValidator: (report) => report.reputation?.averageRating ?? 0 >= 4,
});
```

### Pre-Built Policies

```typescript
import { POLICIES } from '@vaultfire/enterprise';

POLICIES.basic      // Score >= 1, identity required
POLICIES.standard   // Score >= 31 (Silver), identity + bond
POLICIES.sensitive  // Score >= 56 (Gold), identity + active bond
POLICIES.critical   // Score >= 76 (Platinum), identity + active bond + 0.01 ETH min
```

### Map Enterprise Agents to On-Chain Identities

```typescript
// Map an Okta user to their Vaultfire on-chain address
const mapping = await client.mapAgent(
  'okta-user-00u1234',              // enterprise ID
  '0xAGENT_ONCHAIN_ADDRESS',        // on-chain address
  { department: 'ML Platform' },    // optional metadata
);

// Retrieve mapping later
const m = client.getMapping('okta-user-00u1234');
console.log(m?.onChainAddress);
```

### Check Bond Status Between Two Agents

```typescript
const bondStatus = await client.checkBondStatus(
  '0xAGENT_A',
  '0xAGENT_B',
  'base',
);

console.log(bondStatus.bonded);          // true
console.log(bondStatus.hasActiveBond);   // true
console.log(bondStatus.totalBondValue);  // '0.05' (ETH)
```

### Multi-Chain Scan

```typescript
const scan = await client.crossChainScan('0xAGENT_ADDRESS');

console.log(scan.bestScore);       // highest score across all chains
console.log(scan.bestTier);        // e.g. 'Gold'
console.log(scan.recognizedOn);    // ['base', 'arbitrum']
```

### Batch Verify Multiple Agents

```typescript
const reports = await client.batchVerify([
  '0xAGENT_1',
  '0xAGENT_2',
  '0xAGENT_3',
]);

for (const report of reports) {
  console.log(`${report.address}: ${report.streetCred.tier}`);
}
```

---

## Express Middleware

Gate any Express route based on on-chain trust:

```typescript
import express from 'express';
import { VaultfireEnterpriseClient, POLICIES, vaultfireTrustGate } from '@vaultfire/enterprise';

const app = express();
const client = new VaultfireEnterpriseClient();

// Minimal protection — Bronze or above
app.get('/api/agents', vaultfireTrustGate(client, POLICIES.basic));

// Standard — Silver tier, must have bond
app.post('/api/data', vaultfireTrustGate(client, POLICIES.standard, {
  attachReport: true,   // attach trust data to req.vaultfireTrust
}));

// Sensitive — Gold tier, active bond required
app.use('/api/sensitive', vaultfireTrustGate(client, POLICIES.sensitive, {
  rejectionMessage: 'Gold-tier trust required for this endpoint.',
}));

// Critical — Platinum tier + minimum bond value
app.post('/api/governance', vaultfireTrustGate(client, POLICIES.critical));

app.listen(3000);
```

The agent's Ethereum address is read from the `x-agent-address` request header by default (configurable via `addressHeader` option).

### Fastify Support

```typescript
import Fastify from 'fastify';
import { vaultfireFastifyGate } from '@vaultfire/enterprise';

const app = Fastify();

app.addHook('preHandler', vaultfireFastifyGate(client, POLICIES.standard));
```

---

## IAM Adapters

### Okta Adapter

```typescript
import { OktaAdapter } from '@vaultfire/enterprise';
import { Client } from '@okta/okta-sdk-nodejs';

// SECURITY: API token from environment only — never hardcode
const oktaClient = new Client({
  orgUrl: `https://${process.env.OKTA_DOMAIN}`,
  token: process.env.OKTA_API_TOKEN,
});

const adapter = new OktaAdapter(oktaClient, {
  onChainAddressAttribute: 'vaultfireAddress', // custom Okta profile attribute
  agentUserTypes: ['agent', 'service', 'ai-agent'],
});

const records = await adapter.listAgentRecords();
for (const record of records) {
  const address = adapter.extractOnChainAddress(record);
  if (address) {
    await client.mapAgent(record.id, address);
  }
}
```

### Azure AD Adapter

```typescript
import { AzureAdapter } from '@vaultfire/enterprise';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from
  '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

// SECURITY: All credentials from environment variables
const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID!,
  process.env.AZURE_CLIENT_ID!,
  process.env.AZURE_CLIENT_SECRET!,
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

const graphClient = Client.initWithMiddleware({ authProvider });
const adapter = new AzureAdapter(graphClient, {
  agentPrincipalTypes: ['Application', 'ManagedIdentity'],
});
```

Tag a service principal in Azure with `vaultfire:0xYOUR_ADDRESS` to auto-map it.

### Generic OIDC Adapter

Works with Auth0, Keycloak, Cognito, PingIdentity, or any OIDC provider:

```typescript
import { GenericOidcAdapter } from '@vaultfire/enterprise';

const adapter = new GenericOidcAdapter({
  issuer: 'https://your-idp.example.com',
  onChainAddressClaim: 'vaultfire_address', // custom JWT claim
  agentTypeClaim: 'agent_type',
  agentTypeValues: ['agent', 'service'],
});

// Load from pre-verified JWT claims
adapter.loadFromClaims([
  {
    sub: 'agent-001',
    name: 'Invoice Processor',
    agent_type: 'agent',
    vaultfire_address: '0xAGENT_ADDRESS',
  },
]);
```

---

## IAM vs Vaultfire Comparison

| Dimension | Okta / Azure AD | Vaultfire |
|---|---|---|
| **Scope** | Intra-organizational | Cross-organizational |
| **Trust model** | Centralized (your IdP) | Decentralized (on-chain) |
| **Agent identity** | Managed by your admin | Self-sovereign, cryptographic |
| **Cross-org trust** | Not possible natively | Native via bonds |
| **Economic stake** | None | Real ETH bonds — skin in the game |
| **Reputation** | No history | Immutable on-chain history |
| **Multi-chain** | No | 4 chains (Base, Avax, Arbitrum, Polygon) |
| **Revocation** | Admin revokes access | Bond slashing + identity deactivation |

> Okta tells you WHO has access. **Vaultfire tells you WHO is trustworthy.**

---

## Deployed Contracts

| Chain | Chain ID | Identity Registry | Partnership Bonds |
|---|---|---|---|
| **Base** | 8453 | [`0x35978DB...`](https://basescan.org/address/0x35978DB675576598F0781dA2133E94cdCf4858bC) | [`0xC574CF2...`](https://basescan.org/address/0xC574CF2a09B0B470933f0c6a3ef422e3fb25b4b4) |
| **Avalanche** | 43114 | [`0x57741F4...`](https://snowtrace.io/address/0x57741F4116925341d8f7Eb3F381d98e07C73B4a3) | [`0xea6B504...`](https://snowtrace.io/address/0xea6B504827a746d781f867441364C7A732AA4b07) |
| **Arbitrum** | 42161 | [`0x6298c62...`](https://arbiscan.io/address/0x6298c62FDA57276DC60de9E716fbBAc23d06D5F1) | [`0x0E77787...`](https://arbiscan.io/address/0x0E777878C5b5248E1b52b09Ab5cdEb2eD6e7Da58) |
| **Polygon** | 137 | [`0x6298c62...`](https://polygonscan.com/address/0x6298c62FDA57276DC60de9E716fbBAc23d06D5F1) | [`0x0E77787...`](https://polygonscan.com/address/0x0E777878C5b5248E1b52b09Ab5cdEb2eD6e7Da58) |

---

## Vaultfire Ecosystem

| Package | Description |
|---|---|
| [`@vaultfire/agent-sdk`](https://github.com/Ghostkey316/vaultfire-agent-sdk) | Core SDK — register agents, create bonds, query reputation |
| [`@vaultfire/enterprise`](https://github.com/Ghostkey316/vaultfire-enterprise) | **This package** — enterprise IAM bridge |
| [`@vaultfire/langchain`](https://github.com/Ghostkey316/vaultfire-langchain) | LangChain / LangGraph integration |
| [`@vaultfire/a2a`](https://github.com/Ghostkey316/vaultfire-a2a) | Agent-to-Agent (A2A) protocol bridge |
| [`@vaultfire/xmtp`](https://github.com/Ghostkey316/vaultfire-xmtp) | XMTP messaging with trust verification |
| [`@vaultfire/x402`](https://github.com/Ghostkey316/vaultfire-x402) | X402 payment protocol with trust gates |
| [`@vaultfire/vns`](https://github.com/Ghostkey316/vaultfire-vns) | Vaultfire Name Service (VNS) — human-readable agent IDs |
| [`vaultfire-agents`](https://github.com/Ghostkey316/vaultfire-agents) | 3 reference agents with live on-chain trust verification |
| [`vaultfire-a2a-trust-extension`](https://github.com/Ghostkey316/vaultfire-a2a-trust-extension) | A2A Trust Extension spec — on-chain trust for Agent Cards |
| [`vaultfire-showcase`](https://github.com/Ghostkey316/vaultfire-showcase) | Why Vaultfire Bonds beat trust scores — live proof |
| [`vaultfire-whitepaper`](https://github.com/Ghostkey316/vaultfire-whitepaper) | Trust Framework whitepaper — economic accountability for AI |

---

## Security

- All signing operations use `process.env` patterns — never write private keys to files
- This package is **read-only** — no transactions are sent; only view calls
- RPC calls are made directly from the consuming service — no Vaultfire proxy
- IAM adapter credentials are passed as constructor arguments (from env) — never hardcoded

---

## API Reference

### `VaultfireEnterpriseClient`

| Method | Description |
|---|---|
| `mapAgent(enterpriseId, address, metadata?)` | Map an IAM agent to an on-chain address |
| `getMapping(enterpriseId)` | Retrieve a stored mapping |
| `listMappings()` | List all stored mappings |
| `verifyExternalAgent(address, options?)` | Full TrustReport for an agent |
| `meetsPolicy(address, policy)` | Check if agent satisfies a trust policy |
| `getStreetCred(address, chain?)` | Get full Street Cred breakdown |
| `checkBondStatus(agent1, agent2, chain?)` | Check bond status between two agents |
| `batchVerify(addresses[], options?)` | Parallel verify multiple agents |
| `crossChainScan(address)` | Scan agent across all 4 chains |

### `POLICIES`

Pre-built policies: `basic`, `standard`, `sensitive`, `critical`.

### `createPolicy(name, description, rules)`

Build a custom trust policy.

### `vaultfireTrustGate(client, policy, options?)`

Express middleware factory. Options: `addressHeader`, `rejectionMessage`, `attachReport`, `chain`.

### `vaultfireFastifyGate(client, policy, options?)`

Fastify preHandler hook factory.

---

## Contributing

Issues and PRs welcome at [github.com/Ghostkey316/](https://github.com/Ghostkey316/).

---

## License

MIT — [Ghostkey316](https://theloopbreaker.com)
