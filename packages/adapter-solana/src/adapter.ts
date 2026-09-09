/**
 * Adapter assembly: config in → { info, reader, client, rpc } out. The app constructs exactly one
 * adapter at startup (from its env) and hands it to the provider in react.tsx.
 */
import { autoDiscover, createClient } from "@solana/client";
import type { ChainAdapter, ChainInfo } from "@yieldshield/core";
import { resolveConfig, type YieldShieldConfig } from "@yieldshield/sdk";
import { createReader } from "./reader.js";
import { makeRpc, type SolanaRpc } from "./rpc.js";

export type SolanaAdapterConfig = {
  rpcUrl: string;
  /** Defaults to the RPC URL with an ws(s):// scheme. */
  wsUrl?: string;
  poolProgramId?: string;
  oracleProgramId?: string;
  /** Whether this deploy exposes the test-token faucet flow (devnet only). */
  faucet?: boolean;
};

export type SolanaAdapter = ChainAdapter & {
  client: ReturnType<typeof createClient>;
  rpc: SolanaRpc;
  sdkConfig: YieldShieldConfig;
};

export type Cluster = "localnet" | "devnet" | "testnet" | "mainnet";

/** Infer the cluster from the RPC URL (drives explorer links + badges). */
export function clusterFromRpc(url: string): Cluster {
  if (/127\.0\.0\.1|localhost|\[::1\]/.test(url)) return "localnet";
  if (/devnet/.test(url)) return "devnet";
  if (/testnet/.test(url)) return "testnet";
  return "mainnet";
}

/** A Solana Explorer link for a transaction signature, cluster-aware. */
function explorerTxUrl(cluster: Cluster, rpcUrl: string, signature: string): string {
  const base = `https://explorer.solana.com/tx/${signature}`;
  if (cluster === "localnet") return `${base}?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  if (cluster === "mainnet") return base;
  return `${base}?cluster=${cluster}`;
}

export function createSolanaAdapter(config: SolanaAdapterConfig): SolanaAdapter {
  const wsUrl = config.wsUrl ?? config.rpcUrl.replace("https://", "wss://").replace("http://", "ws://");
  const sdkConfig = resolveConfig({
    rpcUrl: config.rpcUrl,
    poolProgramId: config.poolProgramId,
    oracleProgramId: config.oracleProgramId,
  });
  const cluster = clusterFromRpc(config.rpcUrl);

  const info: ChainInfo = {
    family: "solana",
    label: "Solana",
    network: cluster,
    explorerTxUrl: (tx) => explorerTxUrl(cluster, config.rpcUrl, tx),
    protocolId: sdkConfig.poolProgramId,
    oracleLabel: "Pyth + Switchboard",
    capabilities: {
      faucet: config.faucet ?? false,
      needsTokenApprovals: false,
    },
  };

  const rpc = makeRpc(config.rpcUrl);
  return {
    info,
    reader: createReader(rpc),
    client: createClient({ endpoint: config.rpcUrl, websocketEndpoint: wsUrl, walletConnectors: autoDiscover() }),
    rpc,
    sdkConfig,
  };
}
