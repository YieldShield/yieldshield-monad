import { test } from "node:test";
import assert from "node:assert/strict";
import { throttledRpcFetch } from "./rpc-throttle.mjs";

const body = (count) => JSON.stringify(Array.from({ length: count }, (_, id) => ({ id, method: "eth_call" })));
test("concurrent batches count every RPC call against a rolling request window", async () => {
  let time = 0;
  const sent = [];
  const run = throttledRpcFetch({ now: () => time, sleep: async (ms) => { time += ms; }, fetchImpl: async (_, options) => {
    sent.push({ time, count: JSON.parse(options.body).length });
    return new Response("[]");
  } });
  await Promise.all([10, 2, 10, 8, 4, 1].map(count => run("https://rpc.example", { body: body(count) })));
  assert.equal(sent.reduce((sum, s) => sum + s.count, 0), 35);
  for (const event of sent) assert(sent.filter(s => s.time > event.time - 1100 && s.time <= event.time).reduce((n, s) => n + s.count, 0) <= 12);
});
test("failed HTTP requests retain their rate reservation without blocking the queue", async () => {
  let time = 0, attempts = 0;
  const run = throttledRpcFetch({ limit: 1, now: () => time, sleep: async ms => { time += ms; }, fetchImpl: async () => {
    if (++attempts === 1) throw Error("connection failed");
    return new Response("{}");
  } });
  await assert.rejects(run("https://rpc.example", { body: body(1) }), /connection failed/);
  await run("https://rpc.example", { body: body(1) });
  assert(time >= 1100);
});
test("aborted and oversized batches never reach the network", async () => {
  const run = throttledRpcFetch({ fetchImpl: async () => { throw Error("must not fetch"); } });
  await assert.rejects(run("https://rpc.example", { body: body(13) }), /batch exceeds/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(run("https://rpc.example", { body: body(1), signal: controller.signal }), { name: "AbortError" });
});
