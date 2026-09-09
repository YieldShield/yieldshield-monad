import type { ChainReader, TokenBalance } from "@yieldshield/core";
import type { PublicClient } from "viem";
import { createReader, type EvmReaderDeps } from "./reader.js";
import { readDemoVaults, readDemoVaultQuote } from "./vaults.js";
import { decodePositionId } from "./positionId.js";
import { splitRiskPoolAbi } from "./abis/splitRiskPool.js";
import { CRYPTO_EXTENSION } from "./crypto-deployment.js";
import { readPoolCreationOptions } from "./pool-creation.js";
const unique = <T>(values: T[], key: (v: T) => string) => [
  ...new Map(values.map((v) => [key(v).toLowerCase(), v])).values(),
];
/** Every deployment stays independently authenticated; existing receipts remain discoverable. */
export function createMultiReader(client: PublicClient, deployments: EvmReaderDeps[]): ChainReader {
  const readers = deployments.map((d) => createReader(client, d));
  return {
    ...(CRYPTO_EXTENSION && deployments.some((d) => d.factory.toLowerCase() === CRYPTO_EXTENSION?.factory.toLowerCase())
      ? { getPoolCreationOptions: () => readPoolCreationOptions(client) }
      : {}),
    getDemoVaults: () => readDemoVaults(client),
    getDemoVaultQuote: (vault, action, amount) => readDemoVaultQuote(client, vault, action, amount),
    getDemoMarket: () => readers[0]!.getDemoMarket!(),
    getDemoTradeQuote: (r) => readers[0]!.getDemoTradeQuote!(r),
    loadPools: async () => (await Promise.all(readers.map((r) => r.loadPools()))).flat(),
    getOwnerPositions: async (owner) => {
      const sets = await Promise.all(readers.map((r) => r.getOwnerPositions(owner)));
      return { shield: sets.flatMap((s) => s.shield), protector: sets.flatMap((s) => s.protector) };
    },
    listWhitelistedTokens: async () =>
      unique((await Promise.all(readers.map((r) => r.listWhitelistedTokens()))).flat(), (t) => t.token).sort((a, b) =>
        a.symbol.localeCompare(b.symbol),
      ),
    getTokenBalance: (owner, token) => readers[0]!.getTokenBalance(owner, token),
    getBalances: async (owner) =>
      unique<TokenBalance>((await Promise.all(readers.map((r) => r.getBalances(owner)))).flat(), (b) => b.token.token),
    getProtectedExitQuote: async (position) => {
      const { pool } = decodePositionId(position);
      const factory = await client.readContract({ address: pool, abi: splitRiskPoolAbi, functionName: "POOL_FACTORY" });
      const i = deployments.findIndex((d) => d.factory.toLowerCase() === factory.toLowerCase());
      if (i < 0) throw new Error("Position is not part of a configured deployment.");
      return readers[i]!.getProtectedExitQuote!(position);
    },
    getActivity: async (owner) =>
      (await Promise.all(readers.map((r) => r.getActivity(owner))))
        .flat()
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
        .slice(0, 25),
  };
}
