import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encodeEventTopics, encodeAbiParameters, pad, toEventSelector, toHex } from "viem";
import { activityAbi, activityQuery, createEnvioActivity } from "./envio.mjs";
import { assertActivityLogMatch } from "../../scripts/envio-receipt.mjs";

const config = {
  ...JSON.parse(readFileSync(new URL("../../config/envio.json", import.meta.url))),
  startBlock: 100,
  confirmationBlocks: 20,
};
const wallet = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const pool = "0x3333333333333333333333333333333333333333";
const shield = "0x4444444444444444444444444444444444444444";
const backing = "0x5555555555555555555555555555555555555555";
const txHash = "0x" + "aa".repeat(32);
const blockHash = "0x" + "bb".repeat(32);
const registry = {
  chainId: 10143,
  pools: [
    {
      id: "wmon-ausd",
      address: pool,
      symbol: "WMON",
      backingSymbol: "AUSD",
      shieldedToken: shield,
      backingToken: backing,
      environment: "reference",
    },
  ],
  assets: [
    { address: shield, symbol: "WMON", decimals: 18 },
    { address: backing, symbol: "AUSD", decimals: 6 },
  ],
};
const block = (number = 105) => ({ number, hash: blockHash, timestamp: 1720000000 });
function event(
  name = "ShieldedAssetDeposited",
  args = { depositor: wallet, asset: shield, amount: 10n ** 18n, receiptTokenId: 2n },
  overrides = {},
) {
  const abi = activityAbi.find((entry) => entry.name === name);
  const topics = encodeEventTopics({ abi: [abi], eventName: name, args });
  const values = abi.inputs.filter((input) => !input.indexed);
  return {
    address: pool,
    block_number: 105,
    block_hash: blockHash,
    transaction_hash: txHash,
    log_index: 1,
    data: encodeAbiParameters(
      values,
      values.map((input) => args[input.name]),
    ),
    topic0: topics[0],
    topic1: topics[1] ?? null,
    topic2: topics[2] ?? null,
    topic3: topics[3] ?? null,
    removed: false,
    ...overrides,
  };
}
const page = (logs = [event()], next = 181) => ({
  next_block: next,
  archive_height: 200,
  data: { blocks: [block()], logs },
});
const rollbackGuard = (first, last, parent = blockHash) => ({
  first_block_number: first,
  block_number: last,
  timestamp: 1720000000,
  hash: blockHash,
  first_parent_hash: parent,
});
function harness({ pages = [page()], overrides = {}, fetchFn } = {}) {
  let clock = 1720000010000;
  const calls = [];
  const client = createEnvioActivity({
    registry,
    config: { ...config, ...overrides },
    token: "test-secret",
    now: () => clock,
    fetchFn:
      fetchFn ||
      (async (url, init) => {
        calls.push({ url, init });
        if (url.endsWith("/height")) return Response.json({ height: 200 });
        return Response.json(pages.shift() || page());
      }),
  });
  return {
    client,
    calls,
    advance: (ms) => {
      clock += ms;
    },
  };
}

test("query only scans registered pool events and requests provenance fields", () => {
  const query = activityQuery(registry.pools, 100, 181);
  assert.equal(query.from_block, 100);
  assert.equal(query.to_block, 181);
  assert.deepEqual(query.logs[0].address, [pool]);
  assert.equal(query.logs[0].topics[0].length, 8);
  assert.ok(query.field_selection.log.includes("block_hash"));
  assert.equal(query.include_all_blocks, undefined);
});

test("unconfigured activity never calls a provider or pretends there were no events", async () => {
  const client = createEnvioActivity({
    registry,
    config,
    fetchFn: () => {
      throw new Error("unexpected request");
    },
  });
  await client.refresh();
  assert.equal(client.read().status, "not-configured");
  assert.equal(client.read().complete, false);
});

test("first read is nonblocking and concurrent visitors share one provider scan", async () => {
  const { client, calls } = harness();
  assert.equal(client.read().status, "indexing");
  client.read({ owner: wallet });
  client.read({ poolId: "wmon-ausd" });
  await client.refresh();
  assert.equal(calls.length, 2);
  const result = client.read();
  assert.equal(result.status, "ready");
  assert.equal(result.indexedThrough, 180);
  assert.equal(result.events[0].amount, "1000000000000000000");
  assert.equal(result.events[0].asset.decimals, 18);
  assert.equal(result.events[0].receiptId, "2");
  assert.equal(result.events[0].transactionHash, txHash);
  assert.equal(calls[1].init.headers.Authorization, "Bearer test-secret");
  assert.equal(calls[1].init.redirect, "error");
});

test("wallet and pool filters do not create new index scans or leak unrelated events", async () => {
  const { client, calls } = harness();
  await client.refresh();
  assert.equal(client.read({ owner: wallet.toUpperCase().replace("0X", "0x") }).events.length, 1);
  assert.equal(client.read({ owner: other }).events.length, 0);
  assert.equal(client.read({ owner: other }).complete, true);
  assert.equal(calls.length, 2);
  assert.throws(() => client.read({ owner: "bad" }), /Invalid wallet/);
  assert.throws(() => client.read({ poolId: "unregistered" }), /Invalid activity pool/);
  for (const limit of [0, 51, -1, 1.5, NaN]) assert.throws(() => client.read({ limit }), /Invalid activity limit/);
});

test("backing payouts use backing decimals without duplicate activation events", async () => {
  const payout = event("ShieldedWithdrawal", { withdrawer: wallet, amount: 12340000n, preferredAsset: backing });
  const { client } = harness({ pages: [page([payout])] });
  await client.refresh();
  const result = client.read().events[0];
  assert.equal(result.kind, "protection-used");
  assert.equal(result.asset.symbol, "AUSD");
  assert.equal(result.asset.decimals, 6);
  assert.equal(result.receiptId, null);
});

test("partial shield withdrawals are queried and mapped to the owner, withdrawn amount and shielded token", async () => {
  // Match EventsLib.PartialWithdrawal independently of the indexer's ABI:
  // user, oldTokenId and newTokenId are indexed; withdrawn and remaining amounts are data.
  const topic0 = toEventSelector("PartialWithdrawal(address,uint256,uint256,uint256,uint256)");
  const log = {
    ...event(),
    topic0,
    topic1: pad(wallet),
    topic2: toHex(42n, { size: 32 }),
    topic3: toHex(43n, { size: 32 }),
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [1250000000000000000n, 8n * 10n ** 18n]),
  };
  const { client, calls } = harness({ pages: [page([log])] });
  await client.refresh();
  assert.ok(JSON.parse(calls[1].init.body).logs[0].topics[0].includes(topic0));
  const snapshot = client.read({ owner: wallet });
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.totalEvents, 1);
  const result = snapshot.events[0];
  assert.equal(result.eventName, "PartialWithdrawal");
  assert.equal(result.kind, "asset-partially-withdrawn");
  assert.equal(result.actor, wallet);
  assert.equal(result.amount, "1250000000000000000");
  assert.deepEqual(result.asset, { address: shield, symbol: "WMON", decimals: 18 });
  assert.equal(result.receiptId, "42");
  assert.equal(result.transactionHash, txHash);
  assert.equal(client.read({ owner: other }).totalEvents, 0);
  const receiptLog = { data: log.data, topics: [log.topic0, log.topic1, log.topic2, log.topic3] };
  assert.doesNotThrow(() => assertActivityLogMatch(result, receiptLog));
  for (const change of [{ actor: other }, { amount: "8000000000000000000" }, { receiptId: "43" }])
    assert.throws(() => assertActivityLogMatch({ ...result, ...change }, receiptLog), assert.AssertionError);
});

test("notice cancellation has no invented token amount", async () => {
  const log = event("UnlockProcessCancelled", { protector: wallet, tokenId: 3n });
  const { client } = harness({ pages: [page([log])] });
  await client.refresh();
  const result = client.read().events[0];
  assert.equal(result.kind, "notice-cancelled");
  assert.equal(result.amount, null);
  assert.equal(result.asset, null);
});

test("complete pagination preserves fixed end and newest-first order", async () => {
  const second = {
    ...page([event(undefined, undefined, { block_number: 160, log_index: 2 })]),
    data: { blocks: [block(160)], logs: [event(undefined, undefined, { block_number: 160, log_index: 2 })] },
  };
  const { client, calls } = harness({ pages: [page([event()], 150), second] });
  await client.refresh();
  assert.equal(client.read().events.length, 2);
  assert.equal(client.read().events[0].blockNumber, 160);
  const query = JSON.parse(calls[2].init.body);
  assert.equal(query.from_block, 150);
  assert.equal(query.to_block, 181);
  assert.equal(client.read({ limit: 1 }).hasMore, true);
});

test("a new complete scan replaces orphaned history instead of merging it", async () => {
  const { client, advance } = harness({ pages: [page(), page([])] });
  await client.refresh();
  assert.equal(client.read().events.length, 1);
  advance(config.refreshMs);
  await client.refresh();
  assert.equal(client.read().events.length, 0);
  assert.equal(client.read().complete, true);
});

test("failed refresh preserves previous history explicitly marked stale", async () => {
  const { client, advance } = harness({ pages: [page(), { next_block: 100 }] });
  await client.refresh();
  advance(config.refreshMs);
  await client.refresh();
  const result = client.read();
  assert.equal(result.status, "stale");
  assert.equal(result.complete, false);
  assert.equal(result.events.length, 1);
  assert.equal(JSON.stringify(result).includes("test-secret"), false);
});

test("provider authentication or rate limit failures are explicit and sanitized", async () => {
  for (const status of [401, 429, 503]) {
    const { client } = harness({ fetchFn: async () => new Response("secret-provider-body", { status }) });
    await client.refresh();
    const result = client.read();
    assert.equal(result.status, "unavailable");
    assert.equal(result.complete, false);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

test("incomplete or oversized scans never publish partial history as complete", async () => {
  for (const overrides of [{ maxPages: 1 }, { maxEvents: 0 }, { maxResponseBytes: 10 }]) {
    const { client } = harness({ pages: [page([event()], 150)], overrides });
    await client.refresh();
    assert.equal(client.read().status, "unavailable");
    assert.equal(client.read().events.length, 0);
  }
});

test("foreign addresses, unrequested blocks, duplicate logs and bad provenance fail closed", async () => {
  for (const logs of [
    [event(undefined, undefined, { address: other })],
    [event(undefined, undefined, { block_number: 99 })],
    [event(undefined, undefined, { transaction_hash: "invalid" })],
    [event(undefined, undefined, { removed: true })],
    [event(), event()],
    [event("ShieldedAssetDeposited", { depositor: wallet, asset: other, amount: 1n, receiptTokenId: 1n })],
  ]) {
    const { client } = harness({ pages: [page(logs)] });
    await client.refresh();
    assert.equal(client.read().status, "unavailable");
  }
});

test("invalid or remote-future event timestamps never publish a ready snapshot", async () => {
  for (const timestamp of [Number.MAX_SAFE_INTEGER, 8640000000001, -1, 1.5, 1720000071]) {
    const response = page();
    response.data.blocks[0].timestamp = timestamp;
    const { client } = harness({ pages: [response] });
    await client.refresh();
    assert.equal(client.read().status, "unavailable");
    assert.equal(client.read().complete, false);
    assert.equal(client.read().events.length, 0);
  }
});

test("event timestamp validation permits bounded testnet clock skew", async () => {
  const response = page();
  response.data.blocks[0].timestamp = 1720000070;
  const { client } = harness({ pages: [response] });
  await client.refresh();
  const result = client.read();
  assert.equal(result.status, "ready");
  assert.doesNotThrow(() => new Date(result.events[0].timestamp * 1000).toISOString());
});

test("a malformed timestamp refresh retains only the previous validated history", async () => {
  const invalid = page();
  invalid.data.blocks[0].timestamp = Number.MAX_SAFE_INTEGER;
  const { client, advance } = harness({ pages: [page(), invalid] });
  await client.refresh();
  advance(config.refreshMs);
  await client.refresh();
  const result = client.read();
  assert.equal(result.status, "stale");
  assert.equal(result.complete, false);
  assert.equal(result.events[0].timestamp, 1720000000);
});

test("rollback guard mismatch rejects a cross-page fork", async () => {
  const first = { ...page([event()], 150), rollback_guard: rollbackGuard(100, 149) };
  const second = { ...page([]), rollback_guard: rollbackGuard(150, 180, txHash) };
  const { client } = harness({ pages: [first, second] });
  await client.refresh();
  assert.equal(client.read().status, "unavailable");
});

test("a contradictory guard cannot skip the cross-page fork check", async () => {
  const first = { ...page([event()], 150), rollback_guard: rollbackGuard(100, 149) };
  const second = { ...page([]), rollback_guard: rollbackGuard(151, 180, txHash) };
  const { client } = harness({ pages: [first, second] });
  await client.refresh();
  assert.equal(client.read().status, "unavailable");
  assert.equal(client.read().complete, false);
  assert.equal(client.read().events.length, 0);
});

test("supplied rollback guards require complete hashes and exact page boundaries", async () => {
  for (const guard of [
    {},
    { ...rollbackGuard(100, 180), first_block_number: 101 },
    { ...rollbackGuard(100, 180), block_number: 179 },
    { ...rollbackGuard(100, 180), block_number: "180" },
    { ...rollbackGuard(100, 180), hash: "invalid" },
    { ...rollbackGuard(100, 180), first_parent_hash: null },
    { ...rollbackGuard(100, 180), timestamp: -1 },
  ]) {
    const { client } = harness({ pages: [{ ...page(), rollback_guard: guard }] });
    await client.refresh();
    assert.equal(client.read().status, "unavailable");
    assert.equal(client.read().complete, false);
  }
});

test("valid consecutive rollback guards and optional historical guards remain supported", async () => {
  for (const guards of [
    [rollbackGuard(100, 149), rollbackGuard(150, 180)],
    [null, rollbackGuard(150, 180)],
  ]) {
    const { client } = harness({
      pages: [
        { ...page([event()], 150), rollback_guard: guards[0] },
        { ...page([]), rollback_guard: guards[1] },
      ],
    });
    await client.refresh();
    assert.equal(client.read().status, "ready");
    assert.equal(client.read().events.length, 1);
  }
});

test("cached events expire even when a refresh is pending", async () => {
  const { client, advance } = harness();
  await client.refresh();
  advance(config.staleMs + 1);
  assert.equal(client.read().status, "stale");
  await client.refresh();
});

test("free-tier request budgets stop scans and recover after the window", async () => {
  const { client, calls, advance } = harness({ overrides: { maxRequestsPerHour: 2, maxRequestsPerDay: 4 } });
  await client.refresh();
  advance(config.refreshMs);
  await client.refresh();
  assert.equal(calls.length, 2);
  assert.equal(client.read().status, "stale");
  advance(3600001);
  await client.refresh();
  assert.equal(calls.length, 4);
  assert.equal(client.read().status, "ready");
  advance(3600001);
  await client.refresh();
  assert.equal(calls.length, 4);
  assert.equal(client.read().status, "stale");
  advance(86400001);
  await client.refresh();
  assert.equal(calls.length, 6);
});

test("wrong chain or endpoint cannot send the token to a different service", () => {
  assert.throws(() => createEnvioActivity({ registry, config: { ...config, chainId: 143 } }), /Wrong Envio/);
  assert.throws(
    () => createEnvioActivity({ registry, config: { ...config, endpoint: "https://foreign.example" } }),
    /Wrong Envio/,
  );
});
