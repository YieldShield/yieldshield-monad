import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

/** Share one rolling request budget across all JSON-RPC calls, including batched calls. */
export function throttledRpcFetch({ fetchImpl = fetch, now = Date.now, sleep = delay, limit = 12, windowMs = 1100 } = {}) {
  const starts = [];
  let queue = Promise.resolve();
  return async (url, options = {}) => {
    const payload = JSON.parse(options.body);
    const cost = Array.isArray(payload) ? payload.length : 1;
    assert(cost > 0 && cost <= limit, "RPC batch exceeds configured request budget");
    const reservation = queue.then(async () => {
      while (true) {
        options.signal?.throwIfAborted();
        const time = now();
        while (starts.length && starts[0] <= time - windowMs) starts.shift();
        if (starts.length + cost <= limit) {
          starts.push(...Array(cost).fill(time));
          return;
        }
        await sleep(Math.max(1, starts[0] + windowMs - time), undefined, { signal: options.signal });
      }
    });
    queue = reservation.catch(() => {});
    await reservation;
    options.signal?.throwIfAborted();
    return fetchImpl(url, options);
  };
}
