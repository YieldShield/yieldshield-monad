#!/usr/bin/env node
import { throttledRpcFetch } from "../services/monad/rpc-throttle.mjs";
import { retryRateLimitedReads } from "../services/monad/rpc-retry.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, keccak256 } from "viem";
import { monadTestnet } from "viem/chains";
import { ROOT, artifact, assertRuntimeMatches, readCanonicalReceipt, atomicJson } from "./monad-deployment-lib.mjs";
const network = JSON.parse(readFileSync(resolve(ROOT, "config/monad.json")));
const m = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/monad-testnet.json")));
const client = createPublicClient({
  chain: monadTestnet,
  transport: retryRateLimitedReads(
    http(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz", {
      timeout: 20000,
      retryCount: 2,
      batch: { batchSize: 10, wait: 10 },
      fetchFn: throttledRpcFetch(),
    }),
  ),
});
assert.equal(await client.getChainId(), 10143);
assert.equal(m.chainId, 10143);
const links = {};
for (const record of Object.values(m.contracts)) {
  const a = artifact(record.artifact);
  for (const [file, libs] of Object.entries(a.bytecode.linkReferences || {}))
    for (const name of Object.keys(libs)) {
      assert(m.contracts[name], `Missing library ${name}`);
      links[`${file}:${name}`] = m.contracts[name].address;
    }
}
const results = [];
for (const [name, record] of Object.entries(m.contracts)) {
  const code = await client.getCode({ address: record.address });
  assert(code && code !== "0x");
  assert.equal(keccak256(code), record.runtimeCodehash, `Changed runtime: ${name}`);
  assertRuntimeMatches(artifact(record.artifact), code, record.address, links);
  const receipt = await readCanonicalReceipt(client, record.txHash, name);
  assert.equal(receipt.contractAddress?.toLowerCase(), record.address.toLowerCase());
  results.push({
    name,
    address: record.address,
    runtimeCodehash: record.runtimeCodehash,
    txHash: record.txHash,
    blockNumber: String(receipt.blockNumber),
  });
}
const read = (address, n, fn, args = []) =>
  client.readContract({ address, abi: artifact(n).abi, functionName: fn, args });
let referenceOracle = null;
if (m.referenceOracle === "redstone") {
  const adapter = m.contracts.RedstoneReferenceFeed.address;
  assert.equal(
    (await read(adapter, "MonadRedstoneReferenceFeed", "aggregator")).toLowerCase(),
    network.redstone.address.toLowerCase(),
  );
  assert.equal(
    keccak256(await client.getCode({ address: network.redstone.address })),
    network.redstone.runtimeCodehash,
  );
  assert.equal(await read(adapter, "MonadRedstoneReferenceFeed", "MAX_AGE"), 120n);
  for (const [method, expected] of [
    ["wrappedMon", m.contracts.WMON.address],
    ["shMon", network.externalTokens.shMON],
    ["testUsd", m.contracts.TestUSDC.address],
  ])
    assert.equal((await read(adapter, "MonadRedstoneReferenceFeed", method)).toLowerCase(), expected.toLowerCase());
  const [price, publishedAt] = await read(adapter, "MonadRedstoneReferenceFeed", "monPrice");
  referenceOracle = {
    provider: "redstone",
    adapter,
    source: network.redstone.address,
    runtimeCodehash: network.redstone.runtimeCodehash,
    price: String(price),
    publishedAt: String(publishedAt),
    maxAgeSeconds: 120,
  };
}
const pools = [];
for (const p of m.pools) {
  const expectedFactory = m.contracts[p.environment === "reference" ? "ReferenceFactory" : "Factory"].address;
  assert.equal((await read(p.address, "SplitRiskPool", "POOL_FACTORY")).toLowerCase(), expectedFactory.toLowerCase());
  assert.equal(await read(p.address, "SplitRiskPool", "requiresStrictProtectedBackingPrice"), true);
  assert.equal((await read(p.address, "SplitRiskPool", "SHIELDED_TOKEN")).toLowerCase(), p.shieldedToken.toLowerCase());
  assert.equal((await read(p.address, "SplitRiskPool", "BACKING_TOKEN")).toLowerCase(), p.backingToken.toLowerCase());
  for (const token of [p.shieldedToken, p.backingToken]) {
    const expectedFeed =
      token.toLowerCase() === m.contracts.TestUSDVault.address.toLowerCase()
        ? m.contracts.VaultBackingFeed.address
        : p.environment === "reference"
          ? m.contracts[m.referenceOracle === "redstone" ? "RedstoneReferenceFeed" : "ReferenceFeed"].address
          : m.contracts.ScenarioOracle.address;
    const info = await read(expectedFactory, "SplitRiskPoolFactory", "tokenInfo", [token]);
    assert.equal(info[3].toLowerCase(), expectedFeed.toLowerCase(), "Factory oracle wiring mismatch");
  }
  const config = await read(p.address, "SplitRiskPool", "poolConfig");
  assert.equal(config[5], 60n);
  assert.equal(config[6], 120n);
  assert.equal(config[8], 100n);
  assert.equal(await read(p.address, "SplitRiskPool", "COLLATERAL_RATIO"), 15000n);
  const implementation = await client.getStorageAt({
    address: p.address,
    slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  });
  assert.equal("0x" + implementation.slice(-40), m.contracts.BasePoolRouter.address.toLowerCase());
  const receipts = [];
  for (const [method, name] of [
    ["shieldReceiptNFT", "ShieldReceiptNFT"],
    ["protectorReceiptNFT", "ProtectorReceiptNFT"],
  ]) {
    const address = await read(p.address, "SplitRiskPool", method),
      code = await client.getCode({ address });
    assert(code && code !== "0x");
    assertRuntimeMatches(artifact(name), code, address, links);
    assert.equal((await read(address, name, "pool")).toLowerCase(), p.address.toLowerCase());
    receipts.push({ name, address, runtimeCodehash: keccak256(code) });
  }
  pools.push({ ...p, configurationVerified: true, receipts });
}
const report = {
  chainId: 10143,
  checkedAt: new Date().toISOString(),
  deploymentStatus: m.status,
  referenceOracle,
  contracts: results,
  pools,
  allDeclaredContractsVerified: true,
  scenarioReady: m.status === "scenario-complete" || m.status === "complete",
  referenceReady: m.status === "complete",
  note: "Checks declared addresses, canonical receipts, runtime code and pool wiring. Passing partial deployment checks is not full application readiness.",
};
atomicJson(resolve(ROOT, "docs/evidence/deployment-verification.json"), report);
console.log(
  JSON.stringify({
    contracts: results.length,
    pools: pools.length,
    scenarioReady: report.scenarioReady,
    referenceReady: report.referenceReady,
  }),
);
