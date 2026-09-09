/**
 * Adapter assembly: config in → { info, reader, publicClient } out. The wagmi side (wallet
 * connection, tx submission) is layered on in react.tsx; everything here runs headless too
 * (Node scripts, smoke tests).
 */
import {
  createPublicClient,
  fallback,
  http,
  zeroAddress,
  type Address,
  type Chain,
  type PublicClient,
  type Transport,
} from "viem";
import type { ChainAdapter, ChainInfo } from "@yieldshield/core";
import { DEMO_DEPLOYMENTS } from "./demo-deployments.js";
import { DEPLOYMENTS } from "./deployments.js";
import { FAUCET_DEPLOYMENTS } from "./faucet-deployments.js";
import { createMultiReader } from "./multi-reader.js";
import { CRYPTO_EXTENSION } from "./crypto-deployment.js";

export type EvmAdapterConfig = {
  /** viem chain definition (see chains.ts for Robinhood mainnet/testnet). */
  chain: Chain;
  /** Custom RPC is used exclusively. Base Sepolia defaults to batched public endpoints. */
  rpcUrl?: string;
  /** Protocol entry points; default from deployments.ts by chain id. */
  factory?: Address;
  compositeOracle?: Address;
  /** Chain badge label; defaults to the chain name's first word ("Robinhood"). */
  label?: string;
  /** On-chain demo-asset faucet; defaults from deployments.ts. Pass null to disable. */
  faucetAddress?: Address | null;
};

export type EvmAdapter = ChainAdapter & {
  chain: Chain;
  rpcUrl: string;
  /** Shared by headless reads and the wallet provider; optional for existing custom adapters. */
  transport?: Transport;
  publicClient: PublicClient;
  addresses: {
    factory: Address;
    compositeOracle: Address;
    faucet?: Address;
    additionalFactories?: Address[];
    creationFactory?: Address;
  };
};

export function createEvmAdapter(config: EvmAdapterConfig): EvmAdapter {
  const deployment = DEPLOYMENTS[config.chain.id];
  const factory = config.factory ?? deployment?.factory;
  const compositeOracle = config.compositeOracle ?? deployment?.compositeOracle;
  const chainRpcUrl = config.chain.rpcUrls.default.http[0]!;
  const useBasePublicDefaults =
    config.chain.id === 84532 && config.rpcUrl === undefined && chainRpcUrl === "https://sepolia.base.org";
  const rpcUrl = config.rpcUrl ?? (useBasePublicDefaults ? "https://base-sepolia-rpc.publicnode.com" : chainRpcUrl);
  // Small HTTP batches reduce request bursts. Fallback adds no background ranking probes,
  // and both paths retain the caller's exact block tags and canonical receipt checks.
  const transport = useBasePublicDefaults
    ? fallback(
        [
          http(rpcUrl, { batch: { batchSize: 20, wait: 10 }, timeout: 5_000, retryCount: 0 }),
          http(chainRpcUrl, { batch: { batchSize: 20, wait: 10 }, timeout: 5_000, retryCount: 0 }),
        ],
        { rank: false, retryCount: 0 },
      )
    : http(rpcUrl);
  const publicClient = createPublicClient({ chain: config.chain, transport });
  const faucet =
    config.faucetAddress === null
      ? undefined
      : (config.faucetAddress ?? deployment?.faucet ?? FAUCET_DEPLOYMENTS[config.chain.id]);

  const explorer = config.chain.blockExplorers?.default.url;
  const info: ChainInfo = {
    family: "evm",
    label: config.label ?? config.chain.name.split(" ")[0]!,
    network: config.chain.testnet ? "testnet" : "mainnet",
    explorerTxUrl: (tx) => (explorer ? `${explorer}/tx/${tx}` : tx),
    protocolId: factory ?? zeroAddress,
    oracleLabel:
      config.chain.id === 84532
        ? DEMO_DEPLOYMENTS[84532]
          ? "Onchain demo prices"
          : "Relayed Chainlink · alpha"
        : "Chainlink",
    capabilities: {
      faucet: !!faucet,
      needsTokenApprovals: true,
    },
  };

  return {
    info,
    reader:
      factory && compositeOracle
        ? createMultiReader(publicClient, [
            { factory, compositeOracle, deploymentBlock: deployment?.deploymentBlock },
            ...(config.chain.id === 84532 && !config.factory && CRYPTO_EXTENSION ? [CRYPTO_EXTENSION] : []),
          ])
        : new Proxy({} as ChainAdapter["reader"], {
            get: () => async () => {
              throw new Error(
                "Sepolia contracts are awaiting deployment. Live Base stock references remain available on Markets.",
              );
            },
          }),
    chain: config.chain,
    rpcUrl,
    transport,
    publicClient,
    addresses: {
      factory: factory ?? zeroAddress,
      compositeOracle: compositeOracle ?? zeroAddress,
      faucet,
      additionalFactories:
        config.chain.id === 84532 && !config.factory && CRYPTO_EXTENSION ? [CRYPTO_EXTENSION.factory] : [],
      creationFactory: config.chain.id === 84532 && !config.factory ? CRYPTO_EXTENSION?.factory : undefined,
    },
  };
}
