import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverPools, protectionCapacity } from "./pools.mjs";

const addr = (n) => "0x" + n.repeat(40);
const registry = {
  contracts: { Factory: { address: addr("1") }, BasePoolRouter: { address: addr("2") } },
  pools: [],
  assets: [
    { id: "scenario-mon", address: addr("3"), symbol: "sMON", kind: "synthetic" },
    { id: "test-usd", address: addr("4"), symbol: "TestUSDC" },
  ],
};
const discover = (overrides = {}, router = addr("2")) =>
  discoverPools(
    registry,
    async (_a, _abi, fn, _args, block) => {
      assert.equal(block, 123n);
      return {
        getActivePools: [addr("5")],
        getPoolInfo: {
          shieldedToken: addr("3"),
          backingToken: addr("4"),
          commissionRate: 2350n,
          poolFee: 250n,
          colleteralRatio: 22500n,
        },
        POOL_FACTORY: addr("1"),
        ...overrides,
      }[fn];
    },
    async ({ blockNumber }) => {
      assert.equal(blockNumber, 123n);
      return "0x" + "0".repeat(24) + router.slice(2);
    },
    123n,
  );

test("discovers custom collateral and fee pools from the verified factory", async () => {
  const [pool] = await discover();
  assert.equal(pool.address, addr("5"));
  assert.equal(pool.factoryVersion, "scenario-v1");
});
test("custom terms never bypass provenance, router or asset checks", async () => {
  await assert.rejects(discover({ POOL_FACTORY: addr("6") }), /provenance/);
  await assert.rejects(discover({}, addr("6")), /router/);
  assert.deepEqual(await discover({ getPoolInfo: { shieldedToken: addr("7"), backingToken: addr("4") } }), []);
});

const input = {
  totalBacking: 1500n * 10n ** 6n,
  totalShielded: 0n,
  reserved: 0n,
  entryValue: 0n,
  backingPrice: 100000000n,
  shieldPrice: 100000000n,
  backingDecimals: 6,
  shieldDecimals: 6,
  collateralBps: 15000n,
  maxDeposit: 1000000n * 10n ** 6n,
  maxTvl: 10000000n * 10n ** 8n,
};
test("capacity follows the selected ratio, existing exposure, deposit and TVL limits", () => {
  assert.equal(protectionCapacity(input), 1000n * 10n ** 6n);
  assert.equal(protectionCapacity({ ...input, collateralBps: 30000n }), 500n * 10n ** 6n);
  assert.equal(protectionCapacity({ ...input, entryValue: 200n * 10n ** 8n }), 800n * 10n ** 6n);
  assert.equal(protectionCapacity({ ...input, reserved: 1200n * 10n ** 6n }), 200n * 10n ** 6n);
  assert.equal(protectionCapacity({ ...input, maxDeposit: 25n * 10n ** 6n }), 25n * 10n ** 6n);
  assert.equal(protectionCapacity({ ...input, maxTvl: 1525n * 10n ** 8n }), 25n * 10n ** 6n);
  assert.equal(protectionCapacity({ ...input, shieldPrice: 0n }), 0n);
  assert.equal(protectionCapacity({ ...input, reserved: input.totalBacking }), 0n);
});
test("capacity never exceeds USD or native reserves at fractional prices and custom ratios", () => {
  for (const collateralBps of [10000n, 15001n, 23579n, 50000n]) {
    const p = {
      ...input,
      collateralBps,
      shieldDecimals: 18,
      maxDeposit: 1000000n * 10n ** 18n,
      backingPrice: 103123456n,
      shieldPrice: 45123456n,
      reserved: 1000123456n,
    };
    const cap = protectionCapacity(p);
    const usd = (cap * p.shieldPrice) / 10n ** 18n;
    const required = (usd * collateralBps + 9999n) / 10000n;
    assert(required <= (p.totalBacking * p.backingPrice) / 10n ** 6n);
    assert((required * 10n ** 6n) / p.backingPrice <= p.totalBacking - p.reserved);
    const nextUsd = ((cap + 1n) * p.shieldPrice) / 10n ** 18n;
    const nextRequired = (nextUsd * collateralBps + 9999n) / 10000n;
    assert((nextRequired * 10n ** 6n) / p.backingPrice > p.totalBacking - p.reserved);
  }
});
