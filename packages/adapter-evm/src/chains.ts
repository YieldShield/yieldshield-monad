import { base, baseSepolia } from "viem/chains";
export { base, baseSepolia };
import { defineChain } from "viem";

// Canonical Multicall3 — verified deployed on Robinhood testnet (eth_getCode returns bytecode).
const multicall3 = { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } as const;

/** Robinhood Chain mainnet (L2). */
export const robinhood = defineChain({
  id: 4663,
  contracts: { multicall3 },
  name: "Robinhood Chain",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
      webSocket: ["wss://feed.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://robinhoodchain.blockscout.com",
      apiUrl: "https://robinhoodchain.blockscout.com/api/",
    },
  },
  testnet: false,
});

/** Robinhood Chain testnet — the seeded YieldShield deployment lives here (see deployments.ts). */
export const robinhoodTestnet = defineChain({
  id: 46630,
  contracts: { multicall3 },
  name: "Robinhood Chain Testnet",
  nativeCurrency: { decimals: 18, name: "Sepolia Ether", symbol: "ETH" },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.chain.robinhood.com"],
      webSocket: ["wss://feed.testnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
      apiUrl: "https://explorer.testnet.chain.robinhood.com/api/",
    },
  },
  testnet: true,
});

export const evmChains = { base, baseSepolia, robinhood, robinhoodTestnet } as const;
export type EvmChainName = keyof typeof evmChains;
