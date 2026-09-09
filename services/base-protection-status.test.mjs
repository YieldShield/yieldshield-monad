import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAddress, keccak256, zeroAddress } from "viem";
import { STOCKS, USDC } from "./base-market-data.mjs";
import {
  readProtectionStatus,
  publicProtectionStatus,
  unavailableProtectionStatus,
  validateProtectionManifest,
  calculateProtectionCapacity,
} from "./base-protection-status.mjs";

const PUBLIC_MANIFEST = JSON.parse(
  readFileSync(new URL("../contracts/deployments/base-sepolia-alpha.json", import.meta.url), "utf8"),
);
const hash = "0x" + "ab".repeat(32),
  code = "0x60006000";
const id = (address, method, args = []) =>
  JSON.stringify([address.toLowerCase(), method, args], (_, v) =>
    typeof v === "bigint" ? v.toString() : typeof v === "string" && v.startsWith("0x") ? v.toLowerCase() : v,
  );
function fixture({
  complete = false,
  timestamp = Date.parse("2026-09-08T14:00:00Z") / 1000,
  session = [48600, 72000],
} = {}) {
  const manifest = structuredClone(PUBLIC_MANIFEST),
    now = BigInt(timestamp),
    block = { number: 5000n, hash, timestamp: now - 4n };
  let clock = timestamp * 1000;
  const c = (name) => getAddress(manifest.contracts[name].address),
    values = new Map(),
    receipts = new Map(),
    slots = new Map();
  const state = {
    manifest,
    block,
    calls: [],
    source: {
      chainId: 8453,
      blockNumber: 7000n,
      blockHash: hash,
      blockTimestamp: now - 4n,
      sequencer: [1n, 0n, now - 8000n, now - 1000n, 1n],
      assets: [],
    },
    afterReads: null,
  };
  const set = (address, method, args, value) => values.set(id(address, method, args), value);
  for (const record of Object.values(manifest.contracts)) record.runtimeCodehash = keccak256(code);
  for (const tx of Object.values(manifest.transactions))
    if (tx.status === "confirmed") {
      tx.receipt.blockNumber = "100";
      tx.receipt.blockHash = hash;
      receipts.set(tx.hash, { ...tx.receipt, blockNumber: 100n, status: "success", from: manifest.deployer });
    }
  for (const [name, record] of Object.entries(manifest.contracts))
    receipts.get(record.txHash).contractAddress = c(name);
  slots.set(c("Factory").toLowerCase(), "0x" + "00".repeat(12) + c("BaseFactoryRouter").slice(2));
  for (const [name, method, value] of [
    ["Factory", "owner", c("Timelock")],
    ["Factory", "bootstrapModeEnabled", false],
    ["Factory", "compositeOracle", c("CompositeOracle")],
    ["Factory", "splitRiskPoolImplementation", c("BasePoolRouter")],
    ["CoinbaseStockOracleFeed", "innerFeed", c("ChainlinkOracleFeed")],
    ["CoinbaseStockOracleFeed", "marketSessionGate", c("USMarketSessionGate")],
    ["CoinbaseStockOracleFeed", "oracleRegistry", c("BaseSepoliaStockRegistry")],
    ["USMarketSessionGate", "emergencyPaused", false],
    ["BaseSepoliaStockRegistry", "emergencyPaused", false],
    ["BaseSepoliaStockRegistry", "latestRoundData", [1n, 0n, now - 8000n, now - 4n, 1n]],
    ["Faucet", "owner", complete ? c("Timelock") : manifest.deployer],
    ["Faucet", "getAllTokens", complete ? manifest.assets.map((asset) => asset.testToken) : []],
    ["Faucet", "COOLDOWN_PERIOD", 86400n],
  ])
    set(c(name), method, [], value);
  const day = BigInt(Math.floor(Number(block.timestamp) / 86400)),
    second = Number(block.timestamp % 86400n);
  const open = session[1] > 0 && second >= session[0] && second < session[1];
  set(c("USMarketSessionGate"), "isMarketOpen", [], open);
  for (let offset = 0; offset <= 14; offset++)
    set(
      c("USMarketSessionGate"),
      "getDailySession",
      [day + BigInt(offset)],
      offset === 0 ? session : offset === 1 ? [48600, 72000] : [0, 0],
    );
  for (const [index, asset] of manifest.assets.entries()) {
    const source = [...STOCKS, USDC][index],
      price = asset.isEquity ? 20000000000n : 100000000n;
    state.source.assets.push({
      ...source,
      round: [10n, price, now - 60n, now - 60n, 10n],
      multiplier: 10n ** 18n,
      oraclePaused: false,
    });
    const observation = {
      roundId: 10n,
      answer: price,
      startedAt: now - 60n,
      updatedAt: now - 60n,
      answeredInRound: 10n,
      multiplier: 10n ** 18n,
      oraclePaused: false,
      sequencerAnswer: 0n,
      sequencerStartedAt: now - 8000n,
      sourceBlockNumber: 7000n,
      sourceBlockTimestamp: now - 4n,
    };
    set(c("BaseSepoliaStockRegistry"), "lastObservation", [asset.testToken], [observation, now - 4n]);
    set(
      c("BaseSepoliaStockRegistry"),
      "tokenConfigs",
      [asset.testToken],
      [asset.sourceToken, asset.sourceFeed, asset.isEquity],
    );
    set(c("ChainlinkOracleFeed"), "tokenFeeds", [asset.testToken], asset.aggregator);
    set(c("ChainlinkOracleFeed"), "effectiveMaxPriceAge", [asset.testToken], 86400n);
    set(
      c("CompositeOracle"),
      "getTokenOracleFeed",
      [asset.testToken],
      asset.isEquity ? c("CoinbaseStockOracleFeed") : c("ChainlinkOracleFeed"),
    );
    set(
      c("CompositeOracle"),
      asset.isEquity ? "getPrice" : "getPriceWithStrictCircuitBreaker",
      [asset.testToken],
      price,
    );
    set(
      c("CompositeOracle"),
      "getTokenDualFeedStatus",
      [asset.testToken],
      [false, asset.isEquity ? c("CoinbaseStockOracleFeed") : c("ChainlinkOracleFeed"), zeroAddress, false, false, 0n],
    );
    set(c("CompositeOracle"), "isTokenChallengeable", [asset.testToken], false);
    set(c("Faucet"), "enabledTokens", [asset.testToken], complete);
    set(
      c("Faucet"),
      "dripAmount",
      [asset.testToken],
      complete ? (asset.isEquity ? 25n : 10000n) * 10n ** BigInt(asset.decimals) : 0n,
    );
    set(asset.testToken, "balanceOf", [c("Faucet")], complete ? 500000n * 10n ** BigInt(asset.decimals) : 0n);
    if (asset.isEquity) {
      set(c("CoinbaseStockOracleFeed"), "isProtectionOpeningAllowed", [asset.testToken], open);
      set(c("ChainlinkOracleFeed"), "protectionOpeningMaxPriceAgeForToken", [asset.testToken], 3600n);
      set(c("CompositeOracle"), "getPriceForClosedSessionExit", [asset.testToken], open ? null : price);
    }
  }
  manifest.pools = [];
  if (complete) {
    manifest.status = "complete";
    for (const [index, asset] of manifest.assets.filter((asset) => asset.isEquity).entries()) {
      const pool = getAddress("0x" + (1000 + index).toString(16).padStart(40, "0")),
        nft1 = getAddress("0x" + (2000 + index * 2).toString(16).padStart(40, "0")),
        nft2 = getAddress("0x" + (2001 + index * 2).toString(16).padStart(40, "0"));
      manifest.pools.push({
        symbol: asset.symbol,
        address: pool,
        shieldedToken: asset.testToken,
        backingToken: c("Token:USDC"),
      });
      slots.set(pool.toLowerCase(), "0x" + "00".repeat(12) + c("BasePoolRouter").slice(2));
      const fields = {
        POOL_FACTORY: c("Factory"),
        owner: c("Factory"),
        governanceTimelock: c("Timelock"),
        SHIELDED_TOKEN: asset.testToken,
        BACKING_TOKEN: c("Token:USDC"),
        paused: false,
        accessControl: zeroAddress,
        requiresStrictProtectedBackingPrice: true,
        shieldedTokenTransferIntegrityBroken: false,
        poolConfig: [
          1n,
          1000n * 10n ** 8n,
          1n,
          1000000n * 10n ** 6n,
          1000000n * 10n ** 8n,
          86400n,
          28n * 86400n,
          c("Timelock"),
          100n,
          c("CompositeOracle"),
        ],
        poolState: [10n * 10n ** 8n, 50000n * 10n ** 6n],
        totalValueAtDeposit: 2000n * 10n ** 8n,
        totalProtectorTokens: 50000n * 10n ** 6n,
        totalProtectorShares: 50000n * 10n ** 18n,
        totalShieldCollateralAmount: 3000n * 10n ** 6n,
        totalShieldedTokens: 10n * 10n ** 8n,
        COLLATERAL_RATIO: 15000n,
        COMMISSION_RATE: 1000n,
        POOL_FEE: 100n,
        shieldReceiptNFT: nft1,
        protectorReceiptNFT: nft2,
      };
      for (const [method, value] of Object.entries(fields)) set(pool, method, [], value);
      set(c("Factory"), "isPoolActive", [pool], true);
      set(asset.testToken, "balanceOf", [pool], 10n * 10n ** 8n);
      set(c("Token:USDC"), "balanceOf", [pool], 50000n * 10n ** 6n);
      for (const nft of [nft1, nft2]) {
        set(nft, "pool", [], pool);
        set(nft, "owner", [], pool);
      }
    }
  }
  const client = {
    getChainId: async () => 84532,
    getBlockNumber: async (options) => {
      assert.equal(options.cacheTime, 0);
      return 5002n;
    },
    getBlock: async (options) => {
      assert.equal(options.blockNumber, 5000n);
      return block;
    },
    getCode: async (options) => {
      assert.equal(options.blockNumber, 5000n);
      return code;
    },
    getTransactionReceipt: async ({ hash }) => {
      assert(receipts.has(hash));
      return receipts.get(hash);
    },
    getStorageAt: async (options) => {
      assert.equal(options.blockNumber, 5000n);
      return slots.get(options.address.toLowerCase());
    },
    multicall: async (options) => {
      assert.equal(options.blockNumber, 5000n);
      assert.equal(options.allowFailure, true);
      state.calls.push(options.contracts);
      const results = options.contracts.map((call) => {
        const value = values.get(id(call.address, call.functionName, call.args));
        return value == null
          ? { status: "failure", error: new Error("unavailable") }
          : { status: "success", result: value };
      });
      state.afterReads?.();
      return results;
    },
  };
  return {
    state,
    manifest,
    c,
    set,
    values,
    receipts,
    client,
    now: () => clock,
    advance: (seconds) => {
      clock += seconds * 1000;
    },
    read: () => readProtectionStatus({ client, manifest, sourceSnapshot: state.source, now: () => clock }),
  };
}

test("incomplete launch reports real setup, onchain calendar and four upcoming assets without enabling transactions", async () => {
  const f = fixture(),
    status = await f.read();
  assert.equal(status.deployment.verified, true);
  assert.equal(status.deployment.contractsConfirmed, 39);
  assert.equal(status.deployment.transactionsConfirmed, f.receipts.size);
  assert.equal(status.deployment.poolsReady, 0);
  assert.equal(status.faucet.ready, false);
  assert.equal(status.assets.length, 4);
  assert.equal(status.faucet.tokens.length, 5);
  assert(
    status.assets.every(
      (asset) =>
        asset.pool.state === "missing" && asset.pool.terms === null && asset.actions.openPosition.state === "blocked",
    ),
  );
  assert(status.assets[0].actions.openPosition.blockers.some((item) => item.code === "deployment-incomplete"));
  assert.equal(status.session.state, "open");
  assert.equal(status.destination.blockNumber, "5000");
  assert(status.validUntil > status.evaluatedAt);
});

test("closed stock session blocks openings but permits collateral readiness and position-specific stock exits", async () => {
  const f = fixture({ complete: true, timestamp: Date.parse("2026-09-08T12:00:00Z") / 1000 }),
    status = await f.read();
  assert.equal(status.session.state, "closed");
  assert.equal(status.session.nextOpenAt, Date.parse("2026-09-08T13:30:00Z") / 1000);
  assert.equal(status.assets[0].actions.openPosition.state, "blocked");
  assert.equal(status.assets[0].actions.provideCollateral.state, "available");
  assert.equal(status.assets[0].actions.withdrawStock.state, "position-required");
  assert.equal(status.assets[0].actions.protectedExit.state, "position-required");
  assert.equal(status.faucet.ready, true);
});

test("open complete pools report capacity and real terms, while all exits still require a position", async () => {
  const f = fixture({ complete: true }),
    status = await f.read(),
    asset = status.assets[0];
  assert.equal(asset.actions.openPosition.state, "available");
  assert.equal(asset.pool.terms.protectedExitDelaySeconds, 86400);
  assert.equal(asset.pool.terms.collateralUnlockSeconds, 28 * 86400);
  assert(BigInt(asset.pool.capacity.maxDepositBaseUnits) > 0n);
  assert.equal(asset.pool.capacity.requiresSimulation, true);
  assert.equal(asset.actions.withdrawCollateral.state, "position-required");
});

test("missing source data preserves independently checked session and faucet availability", async () => {
  const f = fixture({ complete: true });
  f.state.source = null;
  const status = await f.read();
  assert.equal(status.source, null);
  assert.equal(status.session.state, "open");
  assert.equal(status.faucet.ready, true);
  assert(status.assets[0].actions.openPosition.blockers.some((item) => item.code === "source-unavailable"));
  assert.equal(status.assets[0].actions.provideCollateral.state, "available");
});

test("one asset's failed identity read cannot disable other pools", async () => {
  const f = fixture({ complete: true });
  f.set(f.c("BaseSepoliaStockRegistry"), "tokenConfigs", [f.c("Token:AAPLc")], null);
  const status = await f.read();
  assert.equal(status.assets[0].actions.openPosition.state, "unknown");
  assert.equal(status.assets[1].actions.openPosition.state, "available");
});

test("a mismatched backing route makes every dependent pool fail closed", async () => {
  const f = fixture({ complete: true });
  f.set(f.c("CompositeOracle"), "getTokenOracleFeed", [f.c("Token:USDC")], f.c("CoinbaseStockOracleFeed"));
  assert((await f.read()).assets.every((asset) => asset.actions.openPosition.state === "unknown"));
});

test("source price age and expired relay are distinct from a closed calendar", async () => {
  const f = fixture({ complete: true });
  const old = f.state.block.timestamp - 4000n;
  f.state.source.assets[0].round[2] = old;
  f.state.source.assets[0].round[3] = old;
  const report = f.values.get(id(f.c("BaseSepoliaStockRegistry"), "lastObservation", [f.c("Token:AAPLc")]));
  report[1] = old;
  report[0].sourceBlockTimestamp = old;
  const status = await f.read(),
    codes = status.assets[0].actions.openPosition.blockers.map((item) => item.code);
  assert.equal(status.session.state, "open");
  assert(codes.includes("source-price-stale"));
  assert(codes.includes("relay-stale"));
  assert(!codes.includes("market-closed"));
  assert.equal(status.assets[0].relay.fresh, false);
});

test("status expires at the relay boundary and cached readiness cannot survive it", async () => {
  const f = fixture({ complete: true }),
    now = BigInt(f.now() / 1000),
    report = f.values.get(id(f.c("BaseSepoliaStockRegistry"), "lastObservation", [f.c("Token:AAPLc")]));
  report[1] = now - 590n;
  report[0].sourceBlockTimestamp = now - 590n;
  report[0].updatedAt = now - 600n;
  const status = await f.read();
  assert.equal(status.validUntil, Number(now) + 10);
  f.advance(10);
  assert.throws(() => publicProtectionStatus(status, { now: f.now }), /expired/);
});

test("issuer pause and sequencer outage never yield opening readiness", async () => {
  const f = fixture({ complete: true }),
    token = f.c("Token:AAPLc");
  f.values.get(id(f.c("BaseSepoliaStockRegistry"), "lastObservation", [token]))[0].oraclePaused = true;
  f.set(
    f.c("BaseSepoliaStockRegistry"),
    "latestRoundData",
    [],
    [1n, 1n, f.state.block.timestamp - 8000n, f.state.block.timestamp, 1n],
  );
  const asset = (await f.read()).assets[0],
    codes = asset.actions.openPosition.blockers.map((item) => item.code);
  assert(codes.includes("issuer-paused"));
  assert(codes.includes("sequencer-unavailable"));
  assert.equal(asset.actions.openPosition.state, "blocked");
});

test("calendar next opening comes from configured days, including daylight-saving changes", async () => {
  const f = fixture({ timestamp: Date.parse("2026-11-01T12:00:00Z") / 1000, session: [0, 0] });
  const day = BigInt(Math.floor(Number(f.state.block.timestamp) / 86400));
  f.set(f.c("USMarketSessionGate"), "getDailySession", [day + 1n], [52200, 75600]);
  const status = await f.read();
  assert.equal(status.session.state, "closed");
  assert.equal(status.session.nextOpenAt, Date.parse("2026-11-02T14:30:00Z") / 1000);
});

test("missing future calendar data does not invalidate a known current open session", async () => {
  const f = fixture();
  const day = BigInt(Math.floor(Number(f.state.block.timestamp) / 86400));
  f.set(f.c("USMarketSessionGate"), "getDailySession", [day + 1n], null);
  const status = await f.read();
  assert.equal(status.session.state, "open");
  assert.equal(status.session.nextOpenAt, null);
  assert.equal(status.session.checkedThrough, null);
});

test("emergency session pause blocks openings but not otherwise permitted fresh-price exits", async () => {
  const f = fixture({ complete: true });
  f.set(f.c("USMarketSessionGate"), "emergencyPaused", [], true);
  f.set(f.c("USMarketSessionGate"), "isMarketOpen", [], false);
  const status = await f.read();
  assert.equal(status.session.state, "paused");
  assert.equal(status.assets[0].actions.openPosition.state, "blocked");
  assert.equal(status.assets[0].actions.withdrawStock.state, "position-required");
});

test("an unknown transfer-integrity check cannot authorize opening or protected exit", async () => {
  const f = fixture({ complete: true });
  f.set(f.manifest.pools[0].address, "shieldedTokenTransferIntegrityBroken", [], null);
  const asset = (await f.read()).assets[0];
  assert.equal(asset.actions.openPosition.state, "unknown");
  assert.equal(asset.actions.protectedExit.state, "unknown");
});

test("empty pool collateral deposits remain possible without a readable stock price", async () => {
  const f = fixture({ complete: true }),
    pool = f.manifest.pools[0].address;
  f.set(pool, "poolState", [], [0n, 50000n * 10n ** 6n]);
  f.set(pool, "totalValueAtDeposit", [], 0n);
  f.set(pool, "totalShieldCollateralAmount", [], 0n);
  f.set(pool, "totalShieldedTokens", [], 0n);
  f.set(f.c("CompositeOracle"), "getPrice", [f.c("Token:AAPLc")], null);
  const asset = (await f.read()).assets[0];
  assert.equal(asset.actions.provideCollateral.state, "available");
  assert.equal(asset.actions.openPosition.state, "blocked");
});

test("faucet inventory includes USDC and remains independent of price outages", async () => {
  const f = fixture({ complete: true });
  f.state.source = null;
  f.set(f.c("BaseSepoliaStockRegistry"), "latestRoundData", [], null);
  f.set(f.c("Token:AAPLc"), "balanceOf", [f.c("Faucet")], 0n);
  const status = await f.read();
  assert.equal(status.faucet.ready, true);
  assert.equal(status.faucet.tokens[0].ready, false);
  assert.equal(status.faucet.tokens[4].sourceSymbol, "USDC");
  assert.equal(status.faucet.tokens[4].ready, true);
});

for (const [name, change, pattern] of [
  [
    "wrong chain",
    (f) => {
      f.client.getChainId = async () => 8453;
    },
    /Wrong status RPC/,
  ],
  [
    "zero block hash",
    (f) => {
      f.state.block.hash = "0x" + "00".repeat(32);
    },
    /Invalid sealed block/,
  ],
  [
    "changed final block number",
    (f) => {
      let reads = 0;
      f.client.getBlock = async () => ({ ...f.state.block, number: ++reads > 1 ? 5001n : 5000n });
    },
    /Status block reorged/,
  ],
  ["stale block", (f) => f.advance(200), /Stale or future/],
  [
    "future block",
    (f) => {
      f.state.block.timestamp += 100n;
    },
    /Stale or future/,
  ],
  [
    "changed code",
    (f) => {
      f.client.getCode = async () => "0x00";
    },
    /runtime mismatch/,
  ],
  [
    "wrong receipt",
    (f) => {
      f.receipts.get(f.manifest.contracts.Factory.txHash).transactionHash = hash;
    },
    /receipt mismatch/,
  ],
  [
    "slow reads",
    (f) => {
      f.state.afterReads = () => f.advance(61);
    },
    /expired during evaluation/,
  ],
])
  test(`fails closed for ${name}`, async () => {
    const f = fixture();
    change(f);
    await assert.rejects(f.read(), pattern);
  });

test("unknown fallback never enables any action and has a short retry lifetime", () => {
  const status = unavailableProtectionStatus({ now: () => 1000000 });
  assert.equal(status.validUntil - status.evaluatedAt, 15);
  assert(status.assets.every((asset) => Object.values(asset.actions).every((action) => action.state === "unknown")));
  assert.equal(status.faucet.ready, false);
});

test("manifest rejects mixed source addresses before any chain reads", () => {
  const f = fixture();
  f.manifest.assets[0].sourceToken = USDC.token;
  assert.throws(() => validateProtectionManifest(f.manifest), /source identity/);
});

function capacityFixture() {
  return {
    config: [
      1n,
      1000n * 10n ** 8n,
      1n,
      100000n * 10n ** 6n,
      1000000n * 10n ** 8n,
      86400n,
      2419200n,
      zeroAddress,
      100n,
      zeroAddress,
    ],
    state: [0n, 50000n * 10n ** 6n],
    totalValueAtDeposit: 0n,
    totalProtectorTokens: 50000n * 10n ** 6n,
    totalProtectorShares: 50000n * 10n ** 18n,
    totalShieldCollateralAmount: 0n,
    ratio: 15000n,
    stockPrice: 200n * 10n ** 8n,
    backingPrice: 10n ** 8n,
  };
}
test("capacity respects both collateral constraints with exact integer rounding", () => {
  const f = capacityFixture();
  f.totalShieldCollateralAmount = f.totalProtectorTokens - 100000n;
  const result = calculateProtectionCapacity(f),
    amount = BigInt(result.maxDepositBaseUnits);
  const nativeCap = (a) => {
    const value = (a * f.stockPrice) / 10n ** 8n,
      usdCap = (value * f.ratio + 9999n) / 10000n;
    return (usdCap * 10n ** 6n) / f.backingPrice;
  };
  assert(amount > 0n);
  assert(nativeCap(amount) <= 100000n);
  assert(nativeCap(amount + 1n) > 100000n);
});
test("zero TVL cap allows no positive deposits", () => {
  const f = capacityFixture();
  f.config[4] = 0n;
  const result = calculateProtectionCapacity(f);
  assert.equal(result.maxDepositBaseUnits, "0");
  assert.equal(result.maxCollateralDepositBaseUnits, "0");
});
test("maximum deposit and minimum deposit apply after capacity calculation", () => {
  const f = capacityFixture();
  f.config[1] = 100n;
  assert.equal(calculateProtectionCapacity(f).maxDepositBaseUnits, "100");
  f.config[0] = 101n;
  assert.equal(calculateProtectionCapacity(f).maxDepositBaseUnits, "0");
});
test("tracked TVL includes all recorded backing, not only current protector claims", () => {
  const f = capacityFixture();
  f.state[1] = 200000n * 10n ** 6n;
  f.config[4] = 200001n * 10n ** 8n;
  const result = calculateProtectionCapacity(f);
  assert.equal(result.trackedTvlUsdBaseUnits, String(200000n * 10n ** 8n));
  assert(BigInt(result.maxDepositBaseUnits) < 1000000n);
  assert(BigInt(result.maxCollateralDepositBaseUnits) <= 1000000n);
});

test("an expired source snapshot and relay preserve independently useful calendar and faucet", async () => {
  const f = fixture({ complete: true });
  f.state.source.blockTimestamp -= 1000n;
  for (const asset of f.manifest.assets) {
    const report = f.values.get(id(f.c("BaseSepoliaStockRegistry"), "lastObservation", [asset.testToken]));
    report[1] -= 1000n;
    report[0].sourceBlockTimestamp -= 1000n;
  }
  const status = await f.read();
  assert.equal(status.source, null);
  assert.equal(status.session.state, "open");
  assert.equal(status.faucet.ready, true);
  assert(status.assets.every((asset) => asset.relay.fresh === false));
});
test("a relay receipt later than the pinned block cannot enable opening", async () => {
  const f = fixture({ complete: true });
  const report = f.values.get(id(f.c("BaseSepoliaStockRegistry"), "lastObservation", [f.c("Token:AAPLc")]));
  report[1] = f.state.block.timestamp + 1n;
  const asset = (await f.read()).assets[0];
  assert.equal(asset.relay.fresh, false);
  assert.equal(asset.actions.openPosition.state, "blocked");
});
test("remaining stock liabilities require stock pricing even with no recorded stock balance", async () => {
  const f = fixture({ complete: true }),
    pool = f.manifest.pools[0].address;
  f.set(pool, "poolState", [], [0n, 50000n * 10n ** 6n]);
  f.set(f.c("CompositeOracle"), "getPrice", [f.c("Token:AAPLc")], null);
  const asset = (await f.read()).assets[0];
  assert.equal(asset.actions.provideCollateral.state, "blocked");
  assert.equal(asset.pool.capacity, null);
});
test("collateral capacity respects the maximum protector share supply", () => {
  const f = capacityFixture();
  f.totalProtectorShares = 10n ** 38n;
  assert.equal(calculateProtectionCapacity(f).maxCollateralDepositBaseUnits, "0");
});
test("a drained protector epoch can accept normalized new shares", () => {
  const f = capacityFixture();
  f.totalProtectorShares = 10n ** 38n;
  f.totalProtectorTokens = 0n;
  assert(BigInt(calculateProtectionCapacity(f).maxCollateralDepositBaseUnits) > 0n);
});
test("collateral deposits too small to mint any share have zero practical capacity", () => {
  const f = capacityFixture();
  f.totalProtectorShares = 1n;
  f.config[3] = 1n;
  assert.equal(calculateProtectionCapacity(f).maxCollateralDepositBaseUnits, "0");
});

test("successful historical evidence is cached while live identity reads remain fresh", async () => {
  const f = fixture({ complete: true }),
    originalReceipt = f.client.getTransactionReceipt;
  let receipts = 0;
  f.client.getTransactionReceipt = async (args) => {
    receipts++;
    return originalReceipt(args);
  };
  await f.read();
  assert.equal(receipts, f.receipts.size);
  f.set(f.c("BaseSepoliaStockRegistry"), "tokenConfigs", [f.c("Token:AAPLc")], null);
  const status = await f.read();
  assert.equal(receipts, f.receipts.size);
  assert.equal(status.assets[0].actions.openPosition.state, "unknown");
});
test("historical evidence cache expires and cannot hide later failed verification", async () => {
  const f = fixture();
  await f.read();
  f.advance(600);
  f.state.block.timestamp += 600n;
  f.client.getCode = async () => "0x00";
  await assert.rejects(f.read(), /runtime mismatch/);
});
test("any manifest change invalidates cached deployment evidence", async () => {
  const f = fixture();
  await f.read();
  f.manifest.reviewRevision = "changed";
  f.client.getCode = async () => "0x00";
  await assert.rejects(f.read(), /runtime mismatch/);
});
test("deployment evidence from another RPC client is not reused", async () => {
  const f = fixture();
  await f.read();
  await assert.rejects(
    readProtectionStatus({
      client: { ...f.client, getCode: async () => "0x00" },
      manifest: f.manifest,
      sourceSnapshot: f.state.source,
      now: f.now,
    }),
    /runtime mismatch/,
  );
});
test("failed verification is never cached as successful evidence", async () => {
  const f = fixture(),
    originalCode = f.client.getCode;
  f.client.getCode = async () => "0x00";
  await assert.rejects(f.read(), /runtime mismatch/);
  f.client.getCode = originalCode;
  assert.equal((await f.read()).deployment.verified, true);
});

test("a governed funded faucet remains available before stock pools are activated", async () => {
  const f = fixture({ complete: true });
  f.manifest.status = "awaiting-live-session";
  f.manifest.pools = [];
  const status = await f.read();
  assert.equal(status.faucet.configured, true);
  assert.equal(status.faucet.ready, true);
  assert.equal(status.deployment.poolsReady, 0);
  assert(
    status.assets.every((asset) =>
      asset.actions.openPosition.blockers.some((item) => item.code === "deployment-incomplete"),
    ),
  );
});
