import test from "node:test";
import assert from "node:assert/strict";
import { getAddress, keccak256, zeroAddress, zeroHash } from "viem";
import {
  DEMO_DEPLOYMENT_KIND,
  validateDemoManifest,
  readDemoStatus,
  publicDemoStatus,
  unavailableDemoStatus,
  demoPriceAt,
  demoExchangeCapacity,
} from "./base-demo-status.mjs";

const deployer = "0xA437345Be29EC6802024A8e090E34b621b92E5E2",
  runtime = "0x60006000",
  blockHash = "0x" + "ab".repeat(32);
const addr = (i) => getAddress("0x" + i.toString(16).padStart(40, "0"));
const key = (target, fn, args = []) =>
  JSON.stringify([target.toLowerCase(), fn, args], (_, value) =>
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "string" && value.startsWith("0x")
        ? value.toLowerCase()
        : value,
  );
function fixture({ complete = true } = {}) {
  let clock = Date.parse("2026-09-12T14:00:00Z"); // Saturday: no equity calendar exists in this fixture.
  const block = { number: 5000n, timestamp: BigInt(clock / 1000 - 4), hash: blockHash };
  const manifest = {
    schemaVersion: 2,
    deploymentKind: DEMO_DEPLOYMENT_KIND,
    chainId: 84532,
    deployer,
    status: complete ? "complete" : "preparing",
    contracts: {},
    transactions: {},
    assets: [],
    pools: [],
  };
  const records = [
    "Timelock",
    "Factory",
    "BaseFactoryRouter",
    "BasePoolRouter",
    "CompositeOracle",
    "DemoOracle",
    "DemoExchange",
    "Faucet",
    ...["AAPLc", "NVDAc", "METAc", "GOOGLc", "USDC"].map((symbol) => `Token:${symbol}`),
  ];
  const receipts = new Map(),
    values = new Map(),
    codes = new Map(),
    slots = new Map();
  const c = (name) => manifest.contracts[name].address;
  const set = (target, fn, args, value) => values.set(key(target, fn, args), value);
  for (const [i, name] of records.entries()) {
    const target = addr(i + 1),
      txHash = "0x" + (i + 1).toString(16).padStart(64, "0");
    manifest.contracts[name] = {
      address: target,
      artifact:
        name === "DemoOracle"
          ? "AlphaScenarioOracle"
          : name === "DemoExchange"
            ? "AlphaStockExchange"
            : name.startsWith("Token:")
              ? "BaseSepoliaAlphaToken"
              : name,
      txHash,
      runtimeCodehash: keccak256(runtime),
    };
    const receipt = {
      transactionHash: txHash,
      contractAddress: target,
      from: deployer,
      blockNumber: "100",
      blockHash,
      status: "success",
    };
    manifest.transactions[`deploy:${name}`] = { hash: txHash, status: "confirmed", receipt };
    receipts.set(txHash, { ...receipt, blockNumber: 100n });
    codes.set(target.toLowerCase(), runtime);
  }
  const basePrices = { AAPLc: "10000000000", NVDAc: "15000000000", METAc: "20000000000", GOOGLc: "12500000000" };
  manifest.pricing = {
    kind: "deterministic-demo",
    oracle: c("DemoOracle"),
    exchange: c("DemoExchange"),
    cycleSeconds: 7200,
    basePrices,
  };
  slots.set(c("Factory").toLowerCase(), "0x" + "00".repeat(12) + c("BaseFactoryRouter").slice(2));
  for (const [contract, fn, value] of [
    ["Factory", "owner", c("Timelock")],
    ["Factory", "paused", false],
    ["Factory", "bootstrapModeEnabled", false],
    ["Factory", "compositeOracle", c("CompositeOracle")],
    ["Factory", "splitRiskPoolImplementation", c("BasePoolRouter")],
    ["CompositeOracle", "owner", c("Factory")],
    ["DemoOracle", "quoteToken", c("Token:USDC")],
    ["DemoOracle", "epoch", block.timestamp],
    ["DemoOracle", "cycleSeconds", 7200n],
    ["DemoOracle", "stockCount", 4n],
    ["DemoOracle", "decimals", 8],
    ["DemoExchange", "oracle", c("DemoOracle")],
    ["DemoExchange", "quoteToken", c("Token:USDC")],
    ["DemoExchange", "feeBps", 30n],
    ["DemoExchange", "maxStockAmount", 2500000000n],
    ["Faucet", "owner", c("Timelock")],
    ["Faucet", "COOLDOWN_PERIOD", 86400n],
  ])
    set(c(contract), fn, [], value);
  for (const [i, sourceSymbol] of ["AAPLc", "NVDAc", "METAc", "GOOGLc", "USDC"].entries()) {
    const isEquity = i < 4,
      token = c(`Token:${sourceSymbol}`),
      symbol = isEquity ? `t${sourceSymbol}` : "TestUSDC",
      decimals = isEquity ? 8 : 6;
    const price = BigInt(basePrices[sourceSymbol] ?? "100000000");
    manifest.assets.push({ sourceSymbol, symbol, decimals, isEquity, testToken: token });
    if (isEquity) set(c("DemoOracle"), "stockTokens", [BigInt(i)], token);
    for (const fn of ["basePrice", "getPrice"]) set(c("DemoOracle"), fn, [token], price);
    set(c("DemoOracle"), "priceAt", [token, block.timestamp], price);
    set(c("CompositeOracle"), "getTokenOracleFeed", [token], c("DemoOracle"));
    set(c("CompositeOracle"), isEquity ? "getPrice" : "getPriceWithStrictCircuitBreaker", [token], price);
    set(
      c("CompositeOracle"),
      "getTokenDualFeedStatus",
      [token],
      [false, c("DemoOracle"), zeroAddress, false, false, 0n],
    );
    set(c("CompositeOracle"), "isTokenChallengeable", [token], false);
    set(token, "isSyntheticDemo", [], true);
    set(token, "decimals", [], decimals);
    set(token, "symbol", [], symbol);
    set(token, "balanceOf", [c("Faucet")], 1000000n * 10n ** BigInt(decimals));
    set(token, "balanceOf", [c("DemoExchange")], 1000000n * 10n ** BigInt(decimals));
    set(c("Faucet"), "enabledTokens", [token], true);
    set(c("Faucet"), "dripAmount", [token], (isEquity ? 25n : 10000n) * 10n ** BigInt(decimals));
    if (!isEquity || !complete) continue;
    const pool = addr(100 + i),
      nft1 = addr(200 + i * 2),
      nft2 = addr(201 + i * 2);
    manifest.pools.push({ symbol, address: pool, shieldedToken: token, backingToken: c("Token:USDC") });
    codes.set(pool.toLowerCase(), runtime);
    slots.set(pool.toLowerCase(), "0x" + "00".repeat(12) + c("BasePoolRouter").slice(2));
    const fields = {
      POOL_FACTORY: c("Factory"),
      owner: c("Factory"),
      governanceTimelock: c("Timelock"),
      SHIELDED_TOKEN: token,
      BACKING_TOKEN: c("Token:USDC"),
      paused: false,
      accessControl: zeroAddress,
      requiresStrictProtectedBackingPrice: true,
      shieldedTokenTransferIntegrityBroken: false,
      poolConfig: [
        1n,
        100000000000n,
        1n,
        1000000000000n,
        100000000000000n,
        60n,
        120n,
        c("Timelock"),
        100n,
        c("CompositeOracle"),
      ],
      poolState: [0n, 50000000000n],
      totalValueAtDeposit: 0n,
      totalProtectorTokens: 50000000000n,
      totalProtectorShares: 50000n * 10n ** 18n,
      totalShieldCollateralAmount: 0n,
      totalShieldedTokens: 0n,
      COLLATERAL_RATIO: 15000n,
      COMMISSION_RATE: 1000n,
      POOL_FEE: 100n,
      shieldReceiptNFT: nft1,
      protectorReceiptNFT: nft2,
    };
    for (const [fn, value] of Object.entries(fields)) set(pool, fn, [], value);
    set(c("Factory"), "isPoolActive", [pool], true);
    set(token, "balanceOf", [pool], 0n);
    set(c("Token:USDC"), "balanceOf", [pool], 50000000000n);
    for (const nft of [nft1, nft2]) {
      set(nft, "pool", [], pool);
      set(nft, "owner", [], pool);
    }
  }
  set(
    c("Faucet"),
    "getAllTokens",
    [],
    manifest.assets.map((asset) => asset.testToken),
  );
  const state = { calls: [], receiptReads: 0, afterReads: null, finalBlock: null };
  let blockReads = 0;
  const client = {
    getChainId: async () => 84532,
    getBlockNumber: async ({ cacheTime }) => {
      assert.equal(cacheTime, 0);
      blockReads = 0;
      return block.number + 2n;
    },
    getBlock: async ({ blockNumber }) => {
      assert.equal(blockNumber, block.number);
      return blockReads++ > 0 && state.finalBlock ? state.finalBlock : block;
    },
    getCode: async ({ address, blockNumber }) => {
      assert.equal(blockNumber, block.number);
      return codes.get(address.toLowerCase());
    },
    getStorageAt: async ({ address, blockNumber }) => {
      assert.equal(blockNumber, block.number);
      return slots.get(address.toLowerCase());
    },
    getTransactionReceipt: async ({ hash }) => {
      state.receiptReads++;
      assert(receipts.has(hash));
      return receipts.get(hash);
    },
    multicall: async ({ contracts, blockNumber, allowFailure }) => {
      assert.equal(blockNumber, block.number);
      assert.equal(allowFailure, true);
      state.calls.push(...contracts);
      const result = contracts.map((call) => {
        const value = values.get(key(call.address, call.functionName, call.args));
        return value == null ? { status: "failure" } : { status: "success", result: value };
      });
      state.afterReads?.();
      return result;
    },
  };
  return {
    manifest,
    c,
    set,
    values,
    codes,
    slots,
    receipts,
    client,
    block,
    state,
    now: () => clock,
    advance: (s) => {
      clock += s * 1000;
    },
    read: () => readDemoStatus({ client, manifest, now: () => clock }),
  };
}
const codes = (action) => action.blockers.map((blocker) => blocker.code);

test("Saturday demo works without a calendar, mainnet observation or relay; prices are explicitly synthetic", async () => {
  const f = fixture(),
    status = await f.read();
  assert.equal(status.schemaVersion, 2);
  assert.equal(status.session.state, "continuous");
  assert.equal(status.source, null);
  assert.equal(status.sourceChainId, null);
  assert.equal(status.deployment.verified, true);
  assert.equal(status.deployment.poolsReady, 4);
  assert.equal(status.faucet.ready, true);
  assert.equal(status.exchange.ready, true);
  for (const asset of status.assets) {
    assert.equal(asset.pool.address, f.manifest.pools.find((pool) => pool.symbol === asset.symbol).address);
    assert.equal(asset.sourcePrice, null);
    assert.equal(asset.relay, null);
    assert.equal(asset.executionPrice.kind, "deterministic-demo");
    assert.equal(asset.executionPrice.marketObservation, false);
    assert.equal(asset.actions.openPosition.state, "available");
    assert.equal(asset.actions.provideCollateral.state, "available");
    assert.equal(asset.actions.protectedExit.state, "position-required");
    assert.equal(asset.pool.terms.protectedExitDelaySeconds, 60);
    assert.equal(asset.pool.terms.collateralUnlockSeconds, 120);
    assert(BigInt(asset.pool.capacity.maxDepositBaseUnits) > 0n);
    assert.equal(asset.trading.buy.state, "available");
  }
  assert(
    !f.state.calls.some((call) => /session|observation|sequencer|registry|latestRoundData/i.test(call.functionName)),
  );
  assert.equal(publicDemoStatus(status, { now: f.now }), status);
});

test("wrong manifest chain, unknown kind and live source claims fail before RPC", () => {
  for (const mutate of [
    (m) => (m.chainId = 8453),
    (m) => (m.deploymentKind = "arbitrary"),
    (m) => (m.sourceChainId = 8453),
    (m) => (m.assets[0].sourceFeed = addr(999)),
  ]) {
    const f = fixture();
    mutate(f.manifest);
    assert.throws(() => validateDemoManifest(f.manifest));
  }
});

test("wrong RPC chain and mixed pool/token identity fail closed", async () => {
  const f = fixture();
  f.client.getChainId = async () => 8453;
  await assert.rejects(f.read(), /Wrong demo RPC chain/);
  const g = fixture();
  g.manifest.pools[0].shieldedToken = g.c("Token:NVDAc");
  await assert.rejects(g.read(), /Wrong demo pool assets/);
});

test("deployment runtime, receipt sender and factory implementation are checked", async () => {
  const f = fixture();
  f.codes.set(f.c("DemoOracle").toLowerCase(), "0x6001");
  await assert.rejects(f.read(), /runtime mismatch/);
  const g = fixture();
  g.receipts.values().next().value.from = addr(999);
  await assert.rejects(g.read(), /receipt mismatch/);
  const h = fixture();
  h.slots.set(h.c("Factory").toLowerCase(), "0x" + "00".repeat(12) + addr(999).slice(2));
  await assert.rejects(h.read(), /implementation mismatch/);
});

test("unexpected cycle and future epoch stop pricing while the independent faucet works", async () => {
  for (const [fn, value] of [
    ["cycleSeconds", 1200n],
    ["epoch", 9999999999n],
  ]) {
    const f = fixture();
    f.set(f.c("DemoOracle"), fn, [], value);
    const status = await f.read();
    assert.equal(status.deployment.verified, false);
    assert.equal(status.faucet.ready, true);
    assert.equal(status.exchange.ready, false);
    assert(
      status.assets.every((asset) => asset.executionPrice === null && asset.actions.openPosition.state !== "available"),
    );
  }
});

test("one token's wrong route or missing synthetic identity does not block other assets", async () => {
  for (const corrupt of [
    (f) => f.set(f.c("CompositeOracle"), "getTokenOracleFeed", [f.c("Token:AAPLc")], addr(999)),
    (f) => f.set(f.c("Token:AAPLc"), "isSyntheticDemo", [], false),
  ]) {
    const f = fixture();
    corrupt(f);
    const status = await f.read();
    assert.equal(status.assets[0].executionPrice, null);
    assert(codes(status.assets[0].actions.openPosition).includes("price-unavailable"));
    assert.equal(status.assets[1].actions.openPosition.state, "available");
  }
});

test("empty demo pool setup is visible and cannot authorize opening", async () => {
  const f = fixture({ complete: false }),
    status = await f.read();
  assert.equal(status.deployment.poolsReady, 0);
  assert.equal(status.faucet.ready, true);
  for (const asset of status.assets) {
    assert.equal(asset.pool.state, "missing");
    assert(codes(asset.actions.openPosition).includes("deployment-incomplete"));
  }
});

test("pool pause is action-specific and does not disable independent spot trading", async () => {
  const f = fixture();
  f.set(f.manifest.pools[0].address, "paused", [], true);
  const status = await f.read();
  assert(codes(status.assets[0].actions.openPosition).includes("pool-paused"));
  assert.equal(status.assets[0].trading.buy.state, "available");
  assert.equal(status.assets[1].actions.openPosition.state, "available");
});

test("zero collateral blocks protection while provision remains available", async () => {
  const f = fixture(),
    pool = f.manifest.pools[0].address;
  f.set(pool, "totalProtectorTokens", [], 0n);
  f.set(pool, "totalProtectorShares", [], 0n);
  f.set(pool, "poolState", [], [0n, 0n]);
  const status = await f.read();
  assert(codes(status.assets[0].actions.openPosition).includes("capacity-exhausted"));
  assert.equal(status.assets[0].actions.provideCollateral.state, "available");
});

test("empty exchange inventory blocks its direction without blocking funded protection", async () => {
  const f = fixture();
  f.set(f.c("Token:AAPLc"), "balanceOf", [f.c("DemoExchange")], 0n);
  const status = await f.read();
  assert(codes(status.assets[0].trading.buy).includes("liquidity-unavailable"));
  assert.equal(status.assets[0].trading.sell.state, "available");
  assert.equal(status.assets[0].actions.openPosition.state, "available");
});

test("cached historical evidence never caches live oracle routes or owners", async () => {
  const f = fixture();
  await f.read();
  const initial = f.state.receiptReads;
  f.set(f.c("CompositeOracle"), "getTokenOracleFeed", [f.c("Token:AAPLc")], addr(999));
  const status = await f.read();
  assert.equal(f.state.receiptReads, initial);
  assert.equal(status.assets[0].executionPrice, null);
  f.manifest.contracts.DemoOracle.runtimeCodehash = keccak256("0x6001");
  await assert.rejects(f.read(), /runtime mismatch/);
});

test("zero-hash, stale, future and reorged sealed blocks are rejected", async () => {
  for (const mutate of [
    (f) => (f.block.hash = zeroHash),
    (f) => f.advance(121),
    (f) => (f.block.timestamp += 1000n),
    (f) => (f.state.finalBlock = { ...f.block, number: f.block.number + 1n }),
    (f) => (f.state.finalBlock = { ...f.block, hash: "0x" + "cd".repeat(32) }),
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.read());
  }
});

test("public demo snapshots expire and unknown responses cannot authorize transactions", async () => {
  const f = fixture(),
    status = await f.read();
  f.advance(60);
  assert.throws(() => publicDemoStatus(status, { now: f.now }), /expired/);
  const unavailable = unavailableDemoStatus({ now: f.now });
  assert.equal(unavailable.deployment.verified, false);
  assert.equal(unavailable.faucet.ready, false);
  assert.equal(unavailable.exchange.ready, false);
  assert(
    unavailable.assets.every((asset) => Object.values(asset.actions).every((action) => action.state === "unknown")),
  );
  assert.equal(publicDemoStatus(unavailable, { now: f.now }), unavailable);
});

test("deterministic prices match all four legs and use a fixed test-dollar quote", () => {
  const epoch = 1000n;
  for (const [offset, expected] of [
    [0n, 10000000000n],
    [1800n, 12500000000n],
    [3600n, 10000000000n],
    [5400n, 7500000000n],
    [7200n, 10000000000n],
  ])
    assert.equal(demoPriceAt("AAPLc", epoch, epoch + offset), expected);
  assert.equal(demoPriceAt("AAPLc", epoch, epoch + 1n), 10001388888n);
  assert.equal(demoPriceAt("USDC", epoch, epoch + 5400n), 100000000n);
  assert.throws(() => demoPriceAt("AAPLc", epoch, epoch - 1n));
});

test("matching manipulated oracle/composite answers still fail the independent scenario calculation", async () => {
  const f = fixture(),
    token = f.c("Token:AAPLc"),
    wrong = 9900000000n;
  f.set(f.c("DemoOracle"), "getPrice", [token], wrong);
  f.set(f.c("DemoOracle"), "priceAt", [token, f.block.timestamp], wrong);
  f.set(f.c("CompositeOracle"), "getPrice", [token], wrong);
  const status = await f.read();
  assert.equal(status.assets[0].executionPrice, null);
  assert.equal(status.assets[0].actions.openPosition.state, "blocked");
});

test("trade size estimates honor fee rounding, limited cash, stock inventory and the exchange cap", () => {
  assert.deepEqual(demoExchangeCapacity(10000000000n, 100n, 1n), {
    maxBuyStockBaseUnits: "100",
    maxSellStockBaseUnits: "2",
    requiresQuote: true,
  });
  assert.equal(demoExchangeCapacity(10000000000n, 999999999999n, 0n).maxSellStockBaseUnits, "0");
  assert.equal(demoExchangeCapacity(10000000000n, 999999999999n, 999999999999n).maxBuyStockBaseUnits, "2500000000");
});
