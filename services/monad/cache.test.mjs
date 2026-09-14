import test from "node:test";
import assert from "node:assert/strict";
import { createCache } from "./cache.mjs";
test("slow snapshots share pending work and receive a full TTL after completion", async () => {
  let now = 0,
    calls = 0,
    finish;
  const cached = createCache(() => now);
  const load = () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const first = cached("status", 8, load);
  await Promise.resolve();
  now = 20;
  const second = cached("status", 8, load);
  finish("ready");
  assert.deepEqual(await Promise.all([first, second]), ["ready", "ready"]);
  now = 27;
  assert.equal(await cached("status", 8, load), "ready");
  assert.equal(calls, 1);
  now = 28;
  assert.equal(await cached("status", 8, () => "new"), "new");
});
test("a failed snapshot can be retried", async () => {
  const cached = createCache();
  await assert.rejects(
    cached("status", 8, () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.equal(await cached("status", 8, () => "ready"), "ready");
});
