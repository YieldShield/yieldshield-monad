import type { Transport } from "viem";

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
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
]);

function providerRateLimit(error: unknown) {
  for (let cause = error; cause && typeof cause === "object";) {
    const next = cause as { code?: number; details?: string; message?: string; cause?: unknown };
    if (next.code === -32011 && /^requests limited to \d+\/sec$/.test(next.details || next.message || "")) return true;
    cause = next.cause;
  }
  return false;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Monad's -32011 is not retried by viem. Retry only the rejected read, never a batch or signature. */
export function retryRateLimitedReads(
  transport: Transport,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void> = delay,
): Transport {
  return (config) => {
    const connection = transport(config);
    return {
      ...connection,
      async request(args, options) {
        const read = readMethods.has(args.method);
        for (let attempt = 0; ; attempt++) {
          options?.signal?.throwIfAborted();
          try {
            return await connection.request(args, read ? options : { ...options, retryCount: 0 });
          } catch (error) {
            if (!read || attempt >= 2 || !providerRateLimit(error)) throw error;
            await sleep(1100 * (attempt + 1), options?.signal);
          }
        }
      },
    };
  };
}
