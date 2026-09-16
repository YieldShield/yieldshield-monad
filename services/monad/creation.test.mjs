import { test } from "node:test";
import assert from "node:assert/strict";
import { creationBond, creationOptions } from "./creation.mjs";
const a = "0x" + "11".repeat(20),
  b = "0x" + "22".repeat(20),
  zero = "0x" + "00".repeat(20);
const registry = {
  contracts: { Factory: { address: a }, BasePoolRouter: { address: b } },
  assets: [
    { id: "scenario-mon", address: a, decimals: 18 },
    { id: "test-usd", address: b, decimals: 6 },
  ],
};
const state = {
  paused: false,
  minimumCreationBondUsd: 50000000000n,
  getWhitelistedTokens: [a, b],
  splitRiskPoolImplementation: b,
  pendingGovernanceTimelock: zero,
  getActivePools: [],
  maxActivePools: 0n,
  MAX_POOLS: 200n,
  compositeOracle: a,
  getValue: 100000000n,
  tokenInfo: ["Test USD", "TestUSDC", b, a, zero, 15000n],
};
const options = (overrides) =>
  creationOptions(
    registry,
    async (_a, _abi, f) => ({ ...state, ...overrides })[f],
    { Factory: true, BasePoolRouter: true },
    1n,
  );
test("bond rounds upward in token units, including appreciating shares and 18 decimals", () => {
  assert.equal(creationBond(50000000000n, 100000000n, 6), 500000000n);
  const units = creationBond(50000000000n, 103000000n, 6);
  assert((units * 103000000n) / 1000000n >= 50000000000n);
  assert(((units - 1n) * 103000000n) / 1000000n < 50000000000n);
  assert.equal(creationBond(50000000000n, 100000000n, 18), 500n * 10n ** 18n);
  assert.throws(() => creationBond(1n, 0n, 6));
});
test("only whitelisted role-compatible assets receive a quote", async () => {
  const [v] = await options({});
  assert(v.available);
  assert.deepEqual(v.protectedAssets, ["scenario-mon"]);
  assert.equal(v.backing[0].bond, "500000000");
  assert.equal(v.backing[1].available, false);
});
test("paused, changed router, pending governance and full factories fail closed", async () => {
  for (const override of [
    { paused: true },
    { splitRiskPoolImplementation: a },
    { pendingGovernanceTimelock: a },
    { maxActivePools: 1n, getActivePools: [a] },
  ])
    assert.equal((await options(override))[0].available, false);
});
test("failed backing price does not produce a zero bond", async () => {
  const [v] = await options({ getValue: 0n });
  assert(v.available);
  assert(!v.backing[0].available);
  assert.equal(v.backing[0].bond, undefined);
});

test("creation exposes protocol limits and the backing token collateral minimum", async () => {
  const [v] = await options({ tokenInfo: ["", "", b, a, zero, 20000n] });
  assert.equal(v.backing[0].minCollateralBps, "20000");
  assert.equal(v.limits.maxCollateralBps, "50000");
  assert.equal(v.limits.minJuniorFeeBps, "100");
  assert.equal(v.limits.maxCreatorFeeBps, "2000");
  assert.equal((await options({ tokenInfo: ["", "", b, a, zero, 0n] }))[0].backing[0].minCollateralBps, "10000");
  assert.equal((await options({ tokenInfo: [] }))[0].backing[0].available, false);
});
test("a zero governance bond minimum produces a valid zero quote", async () => {
  assert.equal(creationBond(0n, 100000000n, 6), 0n);
  const [v] = await options({ minimumCreationBondUsd: 0n });
  assert.equal(v.backing[0].bond, "0");
  assert.equal(v.backing[0].available, true);
});
