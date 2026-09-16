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

test("expired owner results release capacity before fresh results are evicted", async () => {
  let now = 0;
  const cached = createCache(() => now, { maxEntries: 2 });
  await cached("status", 100, () => "verified");
  await cached("positions:old-owner", 5, () => "old position");
  now = 5;
  await cached("positions:new-owner", 5, () => "new position");
  assert.equal(await cached("status", 100, () => assert.fail("Fresh status was unnecessarily evicted")), "verified");
  assert.equal(await cached("positions:old-owner", 5, () => "refreshed position"), "refreshed position");
});

test("distinct owner results are bounded and evict the least recently used completed result", async () => {
  const cached = createCache(() => 0, { maxEntries: 2 });
  await cached("positions:alice", 100, () => "alice");
  await cached("positions:bob", 100, () => "bob");
  await cached("positions:alice", 100, () => assert.fail("Cache hit repeated work"));
  await cached("positions:carol", 100, () => "carol");
  assert.equal(await cached("positions:alice", 100, () => assert.fail("Most recently used result was evicted")), "alice");
  assert.equal(await cached("positions:bob", 100, () => "bob reloaded"), "bob reloaded");
});

test("full pending capacity rejects new work but preserves shared reads and recovery", async () => {
  let now = 0,
    finish,
    calls = 0;
  const cached = createCache(() => now, { maxEntries: 1 });
  const first = cached("positions:alice", 5, () => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  });
  await Promise.resolve();
  now = 100;
  await assert.rejects(cached("positions:bob", 5, () => assert.fail("Over-capacity work started")), { status: 503 });
  const shared = cached("positions:alice", 5, () => assert.fail("Pending work was duplicated"));
  finish("confirmed");
  assert.deepEqual(await Promise.all([first, shared]), ["confirmed", "confirmed"]);
  assert.equal(calls, 1);
  now = 104;
  assert.equal(await cached("positions:alice", 5, () => assert.fail("TTL did not start at completion")), "confirmed");
  assert.equal(await cached("positions:bob", 5, () => "available again"), "available again");
});

test("completed-result eviction never removes another owner's pending read", async () => {
  const cached = createCache(() => 0, { maxEntries: 2 });
  let finish;
  const pending = cached("positions:pending", 5, () => new Promise((resolve) => { finish = resolve; }));
  await cached("positions:settled", 5, () => "settled");
  await cached("positions:new", 5, () => "new");
  const shared = cached("positions:pending", 5, () => assert.fail("Pending entry was evicted"));
  finish("complete");
  assert.deepEqual(await Promise.all([pending, shared]), ["complete", "complete"]);
});

test("failed pending work releases its capacity and permits a retry", async () => {
  const cached = createCache(() => 0, { maxEntries: 1 });
  let fail;
  const pending = cached("positions:alice", 5, () => new Promise((_, reject) => { fail = reject; }));
  const rejected = assert.rejects(pending, /offline/);
  await Promise.resolve();
  fail(new Error("offline"));
  await rejected;
  assert.equal(await cached("positions:bob", 5, () => "bob"), "bob");
  assert.equal(await cached("positions:alice", 5, () => "alice recovered"), "alice recovered");
});

test("invalid cache capacities cannot disable the bound", () => {
  for (const maxEntries of [0, -1, 1.5, Infinity, NaN])
    assert.throws(() => createCache(Date.now, { maxEntries }), /Invalid cache capacity/);
});
