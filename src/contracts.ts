/**
 * @vaultfire/enterprise — Contract Addresses & ABIs
 * All deployed Vaultfire contracts across supported chains.
 */

import type { ChainConfig, SupportedChain } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Contract Addresses
// ─────────────────────────────────────────────────────────────────────────────

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  base: {
    chainId: 8453,
    rpcUrl: process.env.VAULTFIRE_BASE_RPC ?? 'https://mainnet.base.org',
    contracts: {
      identity: '0x35978DB675576598F0781dA2133E94cdCf4858bC',
      partnership: '0x01C479F0c039fEC40c0Cf1c5C921bab457d57441',
      accountability: '0x6750D28865434344e04e1D0a6044394b726C3dfE',
      reputation: '0xdB54B8925664816187646174bdBb6Ac658A55a5F',
      bridge: '0x94F54c849692Cc64C35468D0A87D2Ab9D7Cb6Fb2',
      vns: '0x1437c4081233A4f0B6907dDf5374Ed610cBD6B25',
    },
  },
  avalanche: {
    chainId: 43114,
    rpcUrl: process.env.VAULTFIRE_AVALANCHE_RPC ?? 'https://api.avax.network/ext/bc/C/rpc',
    contracts: {
      identity: '0x57741F4116925341d8f7Eb3F381d98e07C73B4a3',
      partnership: '0xDC8447c66fE9D9c7D54607A98346A15324b7985D',
      accountability: '0x376831fB2457E34559891c32bEb61c442053C066',
      reputation: '0x11C267C8A75B13A4D95357CEF6027c42F8e7bA24',
      bridge: '0x0dF0523aF5aF2Aef180dB052b669Bea97fee3d31',
    },
  },
  arbitrum: {
    chainId: 42161,
    rpcUrl: process.env.VAULTFIRE_ARBITRUM_RPC ?? 'https://arbitrum-one.publicnode.com',
    contracts: {
      identity: '0x6298c62FDA57276DC60de9E716fbBAc23d06D5F1',
      partnership: '0xdB54B8925664816187646174bdBb6Ac658A55a5F',
      accountability: '0xef3A944f4d7bb376699C83A29d7Cb42C90D9B6F0',
      reputation: '0x8aceF0Bc7e07B2dE35E9069663953f41B5422218',
      bridge: '0xe2aDfe84703dd6B5e421c306861Af18F962fDA91',
      vns: '0x247F31bB2b5a0d28E68bf24865AA242965FF99cd',
    },
  },
  polygon: {
    chainId: 137,
    rpcUrl: process.env.VAULTFIRE_POLYGON_RPC ?? 'https://polygon-bor-rpc.publicnode.com',
    contracts: {
      identity: '0x6298c62FDA57276DC60de9E716fbBAc23d06D5F1',
      partnership: '0x83dd216449B3F0574E39043ECFE275946fa492e9',
      accountability: '0xdB54B8925664816187646174bdBb6Ac658A55a5F',
      reputation: '0x8aceF0Bc7e07B2dE35E9069663953f41B5422218',
      bridge: '0xe2aDfe84703dd6B5e421c306861Af18F962fDA91',
      vns: '0x247F31bB2b5a0d28E68bf24865AA242965FF99cd',
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Contract ABIs (minimal — only what this package needs)
// ─────────────────────────────────────────────────────────────────────────────

export const IDENTITY_ABI = [
  'function getAgent(address) view returns (string agentURI, bool active, string agentType, uint256 registeredAt)',
  'function isAgentActive(address) view returns (bool)',
  'function getTotalAgents() view returns (uint256)',
  'function discoverAgentsByCapability(bytes32) view returns (address[])',
] as const;

export const PARTNERSHIP_ABI = [
  'function getBond(uint256 bondId) view returns (address agent1, address agent2, string partnershipType, uint256 value, bool active, uint256 createdAt)',
  'function nextBondId() view returns (uint256)',
  'function getBondsByParticipant(address) view returns (uint256[])',
  'function calculateBondValue(uint256 bondId) view returns (uint256)',
  'function totalActiveBondValue() view returns (uint256)',
  'function partnershipQualityScore(uint256 bondId) view returns (uint256)',
] as const;

export const REPUTATION_ABI = [
  'function getReputation(address) view returns (uint256 averageRating, uint256 totalFeedbacks, uint256 verifiedFeedbacks, uint256 lastUpdated)',
  'function getVerifiedFeedbackPercentage(address) view returns (uint256)',
] as const;

export const BRIDGE_ABI = [
  'function isAgentRecognized(address) view returns (bool)',
  'function getSyncedAgentCount() view returns (uint256)',
] as const;
