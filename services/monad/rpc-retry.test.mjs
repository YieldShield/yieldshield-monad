import test from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, http } from "viem";
import { retryRateLimitedReads } from "./rpc-retry.mjs";

const limited = { code: -32011, message: "requests limited to 15/sec" };
const call = (to) => ({ method: "eth_call", params: [{ to, data: "0x12345678" }, "0x1234"] });

test("an HTTP-200 partial batch retries only rate-limited reads, at the original block", async () => {
  const requests = [],
    waits = [];
  const client = createPublicClient({
    transport: retryRateLimitedReads(
      http("https://rpc.example/retry-partial", {
        retryCount: 0,
        batch: { batchSize: 10, wait: 1 },
        fetchFn: async (_, options) => {
          const batch = JSON.parse(options.body);
          requests.push(batch);
          return Response.json(
            batch.map((item) => ({
              id: item.id,
              jsonrpc: "2.0",
              ...(requests.length === 1 && item.params[0].to === "0x02" ? { error: limited } : { result: "0x01" }),
            })),
          );
        },
      }),
      {
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    ),
  });
  assert.deepEqual(await Promise.all([client.request(call("0x01")), client.request(call("0x02"))]), ["0x01", "0x01"]);
  assert.deepEqual(
    requests.map((batch) => batch.length),
    [2, 1],
  );
  assert.deepEqual(requests[1][0].params, call("0x02").params);
  assert.deepEqual(waits, [1100]);
});

test("persistent provider rate limits fail after two retries without substituting data", async () => {
  let attempts = 0;
  const waits = [];
  const connection = retryRateLimitedReads(
    () => ({
      request: async () => {
        attempts++;
        throw limited;
      },
    }),
    {
      sleep: async (ms) => {
        waits.push(ms);
      },
    },
  )({});
  await assert.rejects(connection.request(call("0x01")), (error) => error === limited);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [1100, 2200]);
});

test("contract reverts, invalid parameters, and other provider errors are never retried", async () => {
  for (const error of [
    { code: 3, message: "execution reverted: stale oracle" },
    { code: -32602, message: "Invalid params" },
    { code: -32011, message: "execution reverted" },
  ]) {
    let attempts = 0;
    const connection = retryRateLimitedReads(
      () => ({
        request: async () => {
          attempts++;
          throw error;
        },
      }),
      {
        sleep: async () => {
          assert.fail("must not wait");
        },
      },
    )({});
    await assert.rejects(connection.request(call("0x01")), (received) => received === error);
    assert.equal(attempts, 1);
  }
});

test("writes never retry and cancellation stops a queued retry", async () => {
  let attempts = 0;
  const controller = new AbortController();
  const connection = retryRateLimitedReads(
    () => ({
      request: async () => {
        attempts++;
        throw limited;
      },
    }),
    {
      sleep: async () => {
        controller.abort();
      },
    },
  )({});
  await assert.rejects(connection.request({ method: "eth_sendRawTransaction", params: ["0x"] }), (e) => e === limited);
  assert.equal(attempts, 1);
  await assert.rejects(connection.request(call("0x01"), { signal: controller.signal }), { name: "AbortError" });
  assert.equal(attempts, 2);
});
