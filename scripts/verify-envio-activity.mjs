import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, decodeEventLog, http } from "viem";
import { monadTestnet } from "viem/chains";
import { createEnvioActivity, activityAbi } from "../services/monad/envio.mjs";

const registry = JSON.parse(readFileSync(new URL("../config/deployment.json", import.meta.url)));
const config = JSON.parse(readFileSync(new URL("../config/envio.json", import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const api = option("--api");
const output = option("--out");
if (args.some((arg, index) => index % 2 === 0 && !["--api", "--out"].includes(arg)) || args.length % 2)
  throw new Error(
    "Usage: node scripts/verify-envio-activity.mjs [--api https://monad-api.yieldshield.ai] [--out evidence.json]",
  );
const start = performance.now();
let requests = 0;
let read;
if (api) {
  const url = new URL(api);
  if (url.origin !== "https://monad-api.yieldshield.ai" && !["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Use the YieldShield Monad API or a local test server");
  read = async ({ poolId } = {}) => {
    const response = await fetch(`${url.origin}/api/activity${poolId ? `?pool=${encodeURIComponent(poolId)}` : ""}`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200, "Activity API HTTP status");
    return response.json();
  };
} else {
  assert.ok(process.env.ENVIO_API_TOKEN, "Set a Free-tier ENVIO_API_TOKEN in an ignored local environment file");
  const activity = createEnvioActivity({
    registry,
    config,
    token: process.env.ENVIO_API_TOKEN,
    fetchFn: (...params) => {
      requests++;
      return fetch(...params);
    },
  });
  await activity.refresh();
  read = async (filter) => activity.read(filter);
}
const snapshot = await read();
assert.equal(snapshot.status, "ready", `Activity is ${snapshot.status}; no successful live integration is claimed`);
assert.equal(snapshot.chainId, 10143);
assert.equal(snapshot.complete, true);
assert.ok(snapshot.indexedThrough >= config.startBlock);
assert.ok(snapshot.totalEvents > 0, "Expected historical events from the deployed testnet pools");
const rpc = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL || monadTestnet.rpcUrls.default.http[0], { timeout: 12000, retryCount: 1 }),
});
assert.equal(await rpc.getChainId(), 10143);
const samples = [];
for (const pool of registry.pools) {
  const result = await read({ poolId: pool.id, limit: 1 });
  assert.equal(result.status, "ready");
  assert.ok(result.events.length, `Expected activity for ${pool.id}`);
  const event = result.events[0];
  const receipt = await rpc.getTransactionReceipt({ hash: event.transactionHash });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.blockNumber, BigInt(event.blockNumber));
  assert.equal(receipt.blockHash.toLowerCase(), event.blockHash.toLowerCase());
  const log = receipt.logs.find(
    (log) => log.logIndex === event.logIndex && log.address.toLowerCase() === pool.address.toLowerCase(),
  );
  assert.ok(log, `Indexed log missing from canonical receipt: ${pool.id}`);
  const decoded = decodeEventLog({ abi: activityAbi, data: log.data, topics: log.topics });
  assert.equal(decoded.eventName, event.eventName);
  const actor =
    decoded.args.depositor ||
    decoded.args.withdrawer ||
    decoded.args.user ||
    decoded.args.protector ||
    decoded.args.protectorAddress;
  assert.equal(actor.toLowerCase(), event.actor.toLowerCase());
  const amount = decoded.args.amount ?? decoded.args.assets;
  assert.equal(amount == null ? null : String(amount), event.amount);
  samples.push({
    poolId: pool.id,
    kind: event.kind,
    eventName: event.eventName,
    transactionHash: event.transactionHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    receiptMatched: true,
  });
}
const evidence = {
  checkedAt: new Date().toISOString(),
  source: snapshot.source,
  chainId: 10143,
  scope: snapshot.scope,
  status: snapshot.status,
  api: api || null,
  indexedThrough: snapshot.indexedThrough,
  sourceHeight: snapshot.sourceHeight,
  startBlock: snapshot.startBlock,
  totalEvents: snapshot.totalEvents,
  poolCount: snapshot.poolCount,
  providerRequests: api ? null : requests,
  elapsedMs: Math.round(performance.now() - start),
  samples,
  limitation:
    "Historical testnet transactions include internal verification. Event counts are not user adoption or monetary volume.",
};
if (output) writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
