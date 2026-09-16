import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";
import { throttledRpcFetch } from "./rpc-throttle.mjs";
import { retryRateLimitedReads } from "./rpc-retry.mjs";

/** Batch caller-independent view functions without trusting another deployed contract.
 * viem executes its pinned Multicall bytecode inside eth_call (no transaction).
 * Calls at different block heights remain separate; individual reverts still reject.
 * Keep wallet simulation and signing on their existing, unbatched client.
 */
export function createMonadReadClient(rpcUrl, { fetchImpl = fetch, aggregate = true } = {}) {
  return createPublicClient({
    chain: monadTestnet,
    batch: aggregate ? { multicall: { deployless: true, batchSize: 2048, wait: 0 } } : undefined,
    transport: retryRateLimitedReads(
      http(rpcUrl, {
        timeout: 12000,
        retryCount: 1,
        batch: { batchSize: 10, wait: 10 },
        fetchFn: throttledRpcFetch({ fetchImpl }),
      }),
    ),
  });
}
