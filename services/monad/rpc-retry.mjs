import { setTimeout as delay } from "node:timers/promises";

const readMethods = new Set([
  "eth_call",
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getCode",
  "eth_getBalance",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
]);

function providerRateLimit(error) {
  for (let cause = error; cause; cause = cause.cause) {
    if (cause.code === -32011 && /^requests limited to \d+\/sec$/.test(cause.details || cause.message || ""))
      return true;
  }
  return false;
}

/** Monad's public RPC uses -32011, which viem does not classify as retryable.
 * Retry only rejected reads; retain their exact parameters (including block).
 * Each attempt still passes through the shared RPC throttle. No stale fallback.
 */
export function retryRateLimitedReads(transport, { sleep = delay, retries = 2, delayMs = 1100 } = {}) {
  return (config) => {
    const connection = transport(config);
    return {
      ...connection,
      async request(args, options) {
        for (let attempt = 0; ; attempt++) {
          options?.signal?.throwIfAborted();
          try {
            return await connection.request(args, options);
          } catch (error) {
            if (attempt >= retries || !readMethods.has(args.method) || !providerRateLimit(error)) throw error;
            await sleep(delayMs * (attempt + 1), undefined, { signal: options?.signal });
          }
        }
      },
    };
  };
}
