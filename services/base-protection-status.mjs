/** Read-only availability for the reviewed Base Sepolia deployment. Never supplies wallet commands.
 * The committed deployment manifest is a reviewed inventory. Runtime/receipt checks attest that
 * inventory against the configured RPC; they are not an independent audit or a state proof.
 */
import assert from "node:assert/strict";
import { getAddress, keccak256, parseAbi, toHex, zeroAddress, zeroHash } from "viem";
import { STOCKS, USDC, publicSnapshot } from "./base-market-data.mjs";

export const STATUS_TTL_SECONDS = 60;
export const BLOCK_MAX_AGE_SECONDS = 120;
export const CALENDAR_LOOKAHEAD_DAYS = 14;
export const DEPLOYMENT_EVIDENCE_TTL_SECONDS = 600;
// Historical receipt/code evidence is expensive and independent of live action eligibility.
// Cache only successful evidence for this exact public manifest and RPC client; live routes,
// ownership, proxy implementations, oracle/session reads and pool state are never cached here.
const deploymentEvidence = new WeakMap();
const RELAY_MAX_AGE = 600,
  DAY = 86400,
  MAX_AMOUNT = (1n << 128n) - 1n;
const DEPLOYER = "0xA437345Be29EC6802024A8e090E34b621b92E5E2";
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const eq = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const isUint = (n) => typeof n === "bigint" && n >= 0n;
const positive = (n) => isUint(n) && n > 0n;
const min = (...values) => values.reduce((a, b) => (a < b ? a : b));
const ceilDiv = (a, b) => (a + b - 1n) / b;
const abi = parseAbi([
  "function owner() view returns (address)",
  "function bootstrapModeEnabled() view returns (bool)",
  "function compositeOracle() view returns (address)",
  "function splitRiskPoolImplementation() view returns (address)",
  "function innerFeed() view returns (address)",
  "function marketSessionGate() view returns (address)",
  "function oracleRegistry() view returns (address)",
  "function operator() view returns (address)",
  "function emergencyPaused() view returns (bool)",
  "function isMarketOpen() view returns (bool)",
  "function getDailySession(uint64) view returns (uint32,uint32)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function lastObservation(address) view returns ((uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound,uint128 multiplier,bool oraclePaused,int256 sequencerAnswer,uint256 sequencerStartedAt,uint256 sourceBlockNumber,uint256 sourceBlockTimestamp),uint256)",
  "function tokenConfigs(address) view returns (address,address,bool)",
  "function tokenFeeds(address) view returns (address)",
  "function getTokenOracleFeed(address) view returns (address)",
  "function isTokenConfigured(address) view returns (bool)",
  "function isProtectionOpeningAllowed(address) view returns (bool)",
  "function protectionOpeningMaxPriceAgeForToken(address) view returns (uint256)",
  "function effectiveMaxPriceAge(address) view returns (uint256)",
  "function getPrice(address) view returns (uint256)",
  "function getPriceForClosedSessionExit(address) view returns (uint256)",
  "function getPriceWithStrictCircuitBreaker(address) view returns (uint256)",
  "function getTokenDualFeedStatus(address) view returns (bool,address,address,bool,bool,uint256)",
  "function isTokenChallengeable(address) view returns (bool)",
  "function getAllTokens() view returns (address[])",
  "function COOLDOWN_PERIOD() view returns (uint256)",
  "function enabledTokens(address) view returns (bool)",
  "function dripAmount(address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function isPoolActive(address) view returns (bool)",
  "function paused() view returns (bool)",
  "function POOL_FACTORY() view returns (address)",
  "function SHIELDED_TOKEN() view returns (address)",
  "function BACKING_TOKEN() view returns (address)",
  "function governanceTimelock() view returns (address)",
  "function accessControl() view returns (address)",
  "function requiresStrictProtectedBackingPrice() view returns (bool)",
  "function shieldedTokenTransferIntegrityBroken() view returns (bool)",
  "function poolConfig() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,address,uint96,address)",
  "function poolState() view returns (uint256,uint256)",
  "function totalValueAtDeposit() view returns (uint256)",
  "function totalProtectorTokens() view returns (uint256)",
  "function totalProtectorShares() view returns (uint256)",
  "function totalShieldCollateralAmount() view returns (uint256)",
  "function totalShieldedTokens() view returns (uint256)",
  "function COLLATERAL_RATIO() view returns (uint256)",
  "function COMMISSION_RATE() view returns (uint256)",
  "function POOL_FEE() view returns (uint256)",
  "function shieldReceiptNFT() view returns (address)",
  "function protectorReceiptNFT() view returns (address)",
  "function pool() view returns (address)",
]);
const messages = {
  "deployment-incomplete": "Launch setup is incomplete.",
  "pool-missing": "This test pool is being prepared.",
  "status-unknown": "Availability could not be verified.",
  "market-closed": "The window for new stock protection is closed.",
  "market-paused": "New stock protection is paused.",
  "source-price-stale": "Waiting for a fresh source price.",
  "source-unavailable": "Source market data is unavailable.",
  "relay-stale": "Protection pricing needs a fresh relay observation.",
  "issuer-paused": "The stock issuer has paused its oracle.",
  "sequencer-unavailable": "Source sequencer status is unavailable or recovering.",
  "pool-paused": "This pool is paused.",
  "pool-inactive": "This pool is not accepting deposits.",
  "account-restriction": "This pool requires an account-specific access check.",
  "price-unavailable": "The required onchain price is unavailable.",
  "capacity-unavailable": "Available capacity could not be verified.",
  "capacity-exhausted": "The pool has no capacity for the minimum deposit.",
  "position-required": "Check this position's ownership, timing and available withdrawal amount.",
  "oracle-disputed": "A required oracle price is disputed.",
  "accounting-uncovered": "Pool balances do not cover recorded obligations.",
  "transfer-integrity": "This asset's transfer check needs review.",
};
const blocker = (code) => ({ code, message: messages[code] });
const action = (codes, position = false) => {
  const unique = [...new Set(codes)];
  if (unique.length)
    return { state: unique.includes("status-unknown") ? "unknown" : "blocked", blockers: unique.map(blocker) };
  return position
    ? { state: "position-required", blockers: [blocker("position-required")] }
    : { state: "available", blockers: [] };
};
const emptyActions = (code) =>
  Object.fromEntries(
    ["openPosition", "withdrawStock", "protectedExit", "provideCollateral", "withdrawCollateral"].map((name) => [
      name,
      action([code]),
    ]),
  );
function seconds(now) {
  const value = now();
  assert(Number.isSafeInteger(value) && value > 0, "Invalid clock");
  return Math.floor(value / 1000);
}
function checkedAddress(value) {
  assert(
    typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !eq(value, zeroAddress),
    "Invalid deployment address",
  );
  return getAddress(value);
}

export function validateProtectionManifest(manifest) {
  assert.equal(manifest?.schemaVersion, 1);
  assert.equal(manifest.chainId, 84532);
  assert.equal(manifest.sourceChainId, 8453);
  assert(eq(manifest.deployer, DEPLOYER), "Unreviewed deployment account");
  assert(["awaiting-live-session", "complete", "preparing"].includes(manifest.status), "Unknown deployment status");
  assert(manifest.contracts && manifest.transactions && Array.isArray(manifest.assets), "Missing deployment inventory");
  assert.equal(manifest.assets.length, 5, "Expected five test assets");
  const addresses = new Set();
  for (const [name, record] of Object.entries(manifest.contracts)) {
    const address = checkedAddress(record.address);
    assert(!addresses.has(address.toLowerCase()), "Duplicate deployment address");
    addresses.add(address.toLowerCase());
    assert(/^0x[0-9a-fA-F]{64}$/.test(record.runtimeCodehash || ""), "Missing runtime evidence");
    const tx = manifest.transactions[`deploy:${name}`];
    assert(
      tx?.status === "confirmed" && eq(tx.hash, record.txHash) && eq(tx.receipt?.transactionHash, record.txHash),
      "Missing exact deployment receipt",
    );
  }
  const c = (name) => checkedAddress(manifest.contracts[name]?.address);
  for (const name of [
    "Factory",
    "BaseFactoryRouter",
    "BasePoolRouter",
    "Timelock",
    "CompositeOracle",
    "ChainlinkOracleFeed",
    "CoinbaseStockOracleFeed",
    "BaseSepoliaStockRegistry",
    "USMarketSessionGate",
    "Faucet",
  ])
    c(name);
  const assets = [...STOCKS, USDC].map((source) => {
    const matching = manifest.assets.filter((asset) => asset.sourceSymbol === source.symbol);
    assert.equal(matching.length, 1, "Duplicate or missing source");
    const asset = matching[0],
      equity = source.symbol !== "USDC";
    assert(eq(asset.sourceToken, source.token) && eq(asset.sourceFeed, source.feed), "Unreviewed source identity");
    assert(
      eq(asset.testToken, c(`Token:${source.symbol}`)) && eq(asset.aggregator, c(`Aggregator:${source.symbol}`)),
      "Mixed asset deployment",
    );
    assert.equal(asset.symbol, equity ? `t${source.symbol}` : "TestUSDC");
    assert.equal(asset.decimals, equity ? 8 : 6);
    assert.equal(asset.isEquity, equity);
    return { ...asset, name: source.name, testToken: getAddress(asset.testToken) };
  });
  assert(Array.isArray(manifest.pools) && manifest.pools.length <= 4, "Invalid pool inventory");
  const seen = new Set(),
    poolAddresses = new Set();
  for (const pool of manifest.pools) {
    const asset = assets.find((asset) => asset.isEquity && asset.symbol === pool.symbol);
    assert(asset && !seen.has(pool.symbol), "Duplicate or unknown pool");
    seen.add(pool.symbol);
    const address = checkedAddress(pool.address).toLowerCase();
    assert(!addresses.has(address) && !poolAddresses.has(address), "Duplicate pool address");
    poolAddresses.add(address);
    assert(eq(pool.shieldedToken, asset.testToken) && eq(pool.backingToken, assets[4].testToken), "Mixed pool assets");
  }
  if (manifest.status === "complete") assert.equal(manifest.pools.length, 4, "Completed deployment lacks pools");
  return { c, assets };
}

/** Exact integer pool-capacity predicates; these remain estimates until a wallet simulation. */
export function calculateProtectionCapacity({
  config,
  state,
  totalValueAtDeposit,
  totalProtectorTokens,
  totalProtectorShares,
  totalShieldCollateralAmount,
  ratio,
  stockPrice,
  backingPrice,
  stockDecimals = 8,
  backingDecimals = 6,
}) {
  assert(Array.isArray(config) && config.length === 10 && config.slice(0, 7).every(isUint));
  assert(Array.isArray(state) && state.length === 2 && state.every(isUint));
  assert(
    [totalValueAtDeposit, totalProtectorTokens, totalProtectorShares, totalShieldCollateralAmount].every(isUint) &&
      positive(ratio) &&
      positive(backingPrice),
  );
  assert(isUint(stockPrice) && (stockPrice > 0n || state[0] === 0n));
  const stockScale = 10n ** BigInt(stockDecimals),
    backingScale = 10n ** BigInt(backingDecimals);
  const protectorUsd = (totalProtectorTokens * backingPrice) / backingScale;
  const trackedTvlUsd = (state[0] * stockPrice) / stockScale + (state[1] * backingPrice) / backingScale;
  function maximum(upper, predicate) {
    let low = 0n,
      high = upper;
    while (low < high) {
      const mid = (low + high + 1n) / 2n;
      if (predicate(mid)) low = mid;
      else high = mid - 1n;
    }
    return low;
  }
  const shieldMax =
    stockPrice === 0n
      ? 0n
      : maximum(min(config[1], MAX_AMOUNT), (amount) => {
          const value = (amount * stockPrice) / stockScale,
            collateral = (ceilDiv(value * ratio, 10000n) * backingScale) / backingPrice;
          return (
            ceilDiv((totalValueAtDeposit + value) * ratio, 10000n) <= protectorUsd &&
            totalShieldCollateralAmount + collateral <= totalProtectorTokens &&
            trackedTvlUsd + value <= config[4]
          );
        });
  const shieldValue = (shieldMax * stockPrice) / stockScale;
  const available =
    shieldMax >= config[0] &&
    shieldValue > 0n &&
    (ceilDiv(shieldValue * ratio, 10000n) * backingScale) / backingPrice > 0n
      ? shieldMax
      : 0n;
  const currentShares = totalProtectorTokens === 0n ? 0n : totalProtectorShares;
  const sharesMinted = (amount) =>
    currentShares === 0n ? (amount * 10n ** 18n) / backingScale : (amount * currentShares) / totalProtectorTokens;
  const backingMax = maximum(
    min(config[3], MAX_AMOUNT),
    (amount) =>
      trackedTvlUsd + (amount * backingPrice) / backingScale <= config[4] &&
      currentShares + sharesMinted(amount) <= 10n ** 38n,
  );
  const backingAvailable =
    backingMax >= config[2] && (backingMax * backingPrice) / backingScale > 0n && sharesMinted(backingMax) > 0n
      ? backingMax
      : 0n;
  return {
    basis: "pool-constraints-at-block",
    requiresSimulation: true,
    maxDepositBaseUnits: String(available),
    minDepositBaseUnits: String(config[0]),
    maxCollateralDepositBaseUnits: String(backingAvailable),
    minCollateralDepositBaseUnits: String(config[2]),
    trackedTvlUsdBaseUnits: String(trackedTvlUsd),
    freeBackingBaseUnits: String(
      totalProtectorTokens > totalShieldCollateralAmount ? totalProtectorTokens - totalShieldCollateralAmount : 0n,
    ),
  };
}

export function unavailableProtectionStatus({ now = Date.now } = {}) {
  const evaluatedAt = seconds(now);
  return {
    schemaVersion: 1,
    chainId: 84532,
    sourceChainId: 8453,
    evaluatedAt,
    validUntil: evaluatedAt + 15,
    destination: null,
    source: null,
    deployment: {
      status: "unknown",
      verified: false,
      contractsConfirmed: 0,
      transactionsConfirmed: 0,
      poolsReady: 0,
      totalPools: 4,
      faucetReady: false,
      steps: [],
    },
    session: { state: "unknown", opensAt: null, closesAt: null, nextOpenAt: null, checkedThrough: null },
    faucet: { verified: false, address: null, configured: false, ready: false, cooldownSeconds: null, tokens: [] },
    assets: STOCKS.map((stock) => ({
      symbol: `t${stock.symbol}`,
      sourceSymbol: stock.symbol,
      name: stock.name,
      decimals: 8,
      sourcePrice: null,
      relay: null,
      pool: { state: "unknown", terms: null, capacity: null },
      faucet: { ready: false },
      actions: emptyActions("status-unknown"),
    })),
  };
}

/** All calls use a numbered sealed block, never pending/Flashblock state. Unknown reads fail closed. */
export async function readProtectionStatus({ client, manifest, sourceSnapshot, now = Date.now }) {
  const { c, assets } = validateProtectionManifest(manifest);
  assert.equal(await client.getChainId(), 84532, "Wrong status RPC chain");
  const tip = await client.getBlockNumber({ cacheTime: 0 });
  assert(isUint(tip) && tip > 2n, "Invalid sealed tip");
  const block = await client.getBlock({ blockNumber: tip - 2n });
  assert.equal(block.number, tip - 2n);
  assert(
    positive(block.timestamp) && /^0x[0-9a-fA-F]{64}$/.test(block.hash || "") && !eq(block.hash, zeroHash),
    "Invalid sealed block",
  );
  const blockTime = Number(block.timestamp);
  const checkClock = () => {
    const current = seconds(now);
    assert(blockTime <= current && current - blockTime <= BLOCK_MAX_AGE_SECONDS, "Stale or future status block");
    return current;
  };
  checkClock();
  const records = Object.entries(manifest.contracts),
    receipts = new Map();
  const confirmedTransactions = Object.values(manifest.transactions).filter((tx) => tx.status === "confirmed");
  const digest = keccak256(toHex(JSON.stringify(manifest))),
    cached = deploymentEvidence.get(client),
    evidenceTime = checkClock();
  const evidenceValid =
    cached?.digest === digest &&
    cached.blockNumber <= block.number &&
    cached.verifiedAt <= evidenceTime &&
    evidenceTime - cached.verifiedAt < DEPLOYMENT_EVIDENCE_TTL_SECONDS;
  if (!evidenceValid) {
    for (let offset = 0; offset < records.length; offset += 4)
      await Promise.all(
        records.slice(offset, offset + 4).map(async ([name, record]) => {
          const [code, receipt] = await Promise.all([
            client.getCode({ address: record.address, blockNumber: block.number }),
            client.getTransactionReceipt({ hash: record.txHash }),
          ]);
          assert(code && code !== "0x" && eq(keccak256(code), record.runtimeCodehash), `${name}: runtime mismatch`);
          assert(
            eq(receipt.transactionHash, record.txHash) &&
              eq(receipt.contractAddress, record.address) &&
              eq(receipt.from, DEPLOYER) &&
              receipt.status === "success" &&
              receipt.blockNumber <= block.number,
            `${name}: receipt mismatch`,
          );
          receipts.set(record.txHash, receipt);
          const saved = manifest.transactions[`deploy:${name}`].receipt;
          assert(
            eq(receipt.blockHash, saved.blockHash) && receipt.blockNumber === BigInt(saved.blockNumber),
            `${name}: receipt reorged`,
          );
        }),
      );
    for (let offset = 0; offset < confirmedTransactions.length; offset += 4)
      await Promise.all(
        confirmedTransactions.slice(offset, offset + 4).map(async (tx) => {
          const receipt = receipts.get(tx.hash) ?? (await client.getTransactionReceipt({ hash: tx.hash }));
          assert(
            eq(receipt.transactionHash, tx.hash) &&
              eq(tx.receipt?.transactionHash, tx.hash) &&
              receipt.status === "success" &&
              eq(receipt.from, DEPLOYER),
            "Setup receipt mismatch",
          );
          assert(
            eq(receipt.blockHash, tx.receipt.blockHash) &&
              receipt.blockNumber === BigInt(tx.receipt.blockNumber) &&
              receipt.blockNumber <= block.number,
            "Setup receipt reorged",
          );
        }),
      );
    deploymentEvidence.set(client, { digest, verifiedAt: checkClock(), blockNumber: block.number });
  }
  const calls = [],
    add = (key, address, functionName, args = []) => calls.push({ key, address, abi, functionName, args });
  for (const [key, name, method] of [
    ["factoryOwner", "Factory", "owner"],
    ["bootstrap", "Factory", "bootstrapModeEnabled"],
    ["factoryOracle", "Factory", "compositeOracle"],
    ["poolImplementation", "Factory", "splitRiskPoolImplementation"],
    ["wrapperInner", "CoinbaseStockOracleFeed", "innerFeed"],
    ["wrapperGate", "CoinbaseStockOracleFeed", "marketSessionGate"],
    ["wrapperRegistry", "CoinbaseStockOracleFeed", "oracleRegistry"],
    ["marketOpen", "USMarketSessionGate", "isMarketOpen"],
    ["marketPaused", "USMarketSessionGate", "emergencyPaused"],
    ["relayPaused", "BaseSepoliaStockRegistry", "emergencyPaused"],
    ["sequencer", "BaseSepoliaStockRegistry", "latestRoundData"],
    ["faucetOwner", "Faucet", "owner"],
    ["faucetTokens", "Faucet", "getAllTokens"],
    ["cooldown", "Faucet", "COOLDOWN_PERIOD"],
  ])
    add(key, c(name), method);
  const epochDay = Math.floor(blockTime / DAY);
  for (let day = 0; day <= CALENDAR_LOOKAHEAD_DAYS; day++)
    add(`day:${day}`, c("USMarketSessionGate"), "getDailySession", [BigInt(epochDay + day)]);
  for (const asset of assets) {
    const token = asset.testToken,
      prefix = asset.symbol;
    for (const [key, name, method] of [
      ["observation", "BaseSepoliaStockRegistry", "lastObservation"],
      ["identity", "BaseSepoliaStockRegistry", "tokenConfigs"],
      ["feed", "ChainlinkOracleFeed", "tokenFeeds"],
      ["ordinaryMaxAge", "ChainlinkOracleFeed", "effectiveMaxPriceAge"],
      ["route", "CompositeOracle", "getTokenOracleFeed"],
      ["price", "CompositeOracle", asset.isEquity ? "getPrice" : "getPriceWithStrictCircuitBreaker"],
      ["dual", "CompositeOracle", "getTokenDualFeedStatus"],
      ["challengeable", "CompositeOracle", "isTokenChallengeable"],
      ["faucetEnabled", "Faucet", "enabledTokens"],
      ["dripAmount", "Faucet", "dripAmount"],
    ])
      add(`${prefix}:${key}`, c(name), method, [token]);
    add(`${prefix}:faucetBalance`, token, "balanceOf", [c("Faucet")]);
    if (asset.isEquity) {
      add(`${prefix}:openingAllowed`, c("CoinbaseStockOracleFeed"), "isProtectionOpeningAllowed", [token]);
      add(`${prefix}:openingMaxAge`, c("ChainlinkOracleFeed"), "protectionOpeningMaxPriceAgeForToken", [token]);
      add(`${prefix}:closedPrice`, c("CompositeOracle"), "getPriceForClosedSessionExit", [token]);
    }
  }
  for (const pool of manifest.pools) {
    const prefix = `pool:${pool.symbol}`;
    for (const method of [
      "POOL_FACTORY",
      "owner",
      "governanceTimelock",
      "SHIELDED_TOKEN",
      "BACKING_TOKEN",
      "paused",
      "accessControl",
      "requiresStrictProtectedBackingPrice",
      "shieldedTokenTransferIntegrityBroken",
      "poolConfig",
      "poolState",
      "totalValueAtDeposit",
      "totalProtectorTokens",
      "totalProtectorShares",
      "totalShieldCollateralAmount",
      "totalShieldedTokens",
      "COLLATERAL_RATIO",
      "COMMISSION_RATE",
      "POOL_FEE",
      "shieldReceiptNFT",
      "protectorReceiptNFT",
    ])
      add(`${prefix}:${method}`, pool.address, method);
    add(`${prefix}:active`, c("Factory"), "isPoolActive", [pool.address]);
    add(`${prefix}:stockBalance`, pool.shieldedToken, "balanceOf", [pool.address]);
    add(`${prefix}:backingBalance`, pool.backingToken, "balanceOf", [pool.address]);
  }
  const results = await client.multicall({
    contracts: calls.map(({ key: _key, ...call }) => call),
    allowFailure: true,
    blockNumber: block.number,
  });
  assert(Array.isArray(results) && results.length === calls.length, "Incomplete status reads");
  const data = new Map(
    calls.map((call, index) => [call.key, results[index]?.status === "success" ? results[index].result : null]),
  );
  const get = (key) => data.get(key) ?? null;
  const infrastructureReady =
    eq(get("factoryOwner"), c("Timelock")) &&
    get("bootstrap") === false &&
    eq(get("factoryOracle"), c("CompositeOracle")) &&
    eq(get("poolImplementation"), c("BasePoolRouter")) &&
    eq(get("wrapperInner"), c("ChainlinkOracleFeed")) &&
    eq(get("wrapperGate"), c("USMarketSessionGate")) &&
    eq(get("wrapperRegistry"), c("BaseSepoliaStockRegistry"));
  const proxySlot = await client.getStorageAt({
    address: c("Factory"),
    slot: IMPLEMENTATION_SLOT,
    blockNumber: block.number,
  });
  assert(
    typeof proxySlot === "string" && eq("0x" + proxySlot.slice(-40), c("BaseFactoryRouter")),
    "Factory implementation mismatch",
  );
  let nextOpenAt = null,
    opensAt = null,
    closesAt = null,
    calendarKnown = true,
    allCalendarKnown = true,
    todayKnown = true;
  for (let day = 0; day <= CALENDAR_LOOKAHEAD_DAYS; day++) {
    const session = get(`day:${day}`);
    if (
      !Array.isArray(session) ||
      session.length !== 2 ||
      !session.every(Number.isSafeInteger) ||
      session[0] < 0 ||
      session[1] > DAY ||
      (session[1] !== 0 && session[0] >= session[1])
    ) {
      allCalendarKnown = false;
      if (day === 0) todayKnown = false;
      if (nextOpenAt === null) calendarKnown = false;
      continue;
    }
    if (day === 0 && session[1] !== 0) {
      opensAt = epochDay * DAY + session[0];
      closesAt = epochDay * DAY + session[1];
    }
    const start = (epochDay + day) * DAY + session[0];
    if (session[1] !== 0 && start > blockTime && nextOpenAt === null) nextOpenAt = start;
  }
  const expectedOpen = opensAt !== null && blockTime >= opensAt && blockTime < closesAt;
  const sessionKnown =
    todayKnown &&
    typeof get("marketOpen") === "boolean" &&
    typeof get("marketPaused") === "boolean" &&
    (get("marketPaused") || get("marketOpen") === expectedOpen);
  const sessionState = !sessionKnown
    ? "unknown"
    : get("marketPaused")
      ? "paused"
      : get("marketOpen")
        ? "open"
        : "closed";
  if (!calendarKnown) nextOpenAt = null;
  let sourcePublic = null;
  try {
    sourcePublic = publicSnapshot(sourceSnapshot, { now });
  } catch {
    /* Independent destination status still works. */
  }
  const sequencer = get("sequencer");
  const sequencerUp =
    Array.isArray(sequencer) &&
    sequencer.length === 5 &&
    sequencer[1] === 0n &&
    positive(sequencer[2]) &&
    sequencer[2] <= block.timestamp &&
    block.timestamp - sequencer[2] > 3600n
      ? true
      : Array.isArray(sequencer)
        ? false
        : null;
  const inventory = get("faucetTokens");
  const faucetConfigured =
    Array.isArray(inventory) &&
    inventory.length === assets.length &&
    assets.every((asset) => inventory.filter((token) => eq(token, asset.testToken)).length === 1);
  const faucetGoverned = eq(get("faucetOwner"), c("Timelock"));
  const faucetTokens = assets.map((asset) => {
    const enabled = get(`${asset.symbol}:faucetEnabled`),
      amount = get(`${asset.symbol}:dripAmount`),
      balance = get(`${asset.symbol}:faucetBalance`);
    const funded = positive(amount) && isUint(balance) ? balance >= amount : null;
    return {
      symbol: asset.symbol,
      sourceSymbol: asset.sourceSymbol,
      decimals: asset.decimals,
      address: asset.testToken,
      enabled: typeof enabled === "boolean" ? enabled : null,
      funded,
      dripAmountBaseUnits: isUint(amount) ? String(amount) : null,
      balanceBaseUnits: isUint(balance) ? String(balance) : null,
      ready: faucetConfigured && faucetGoverned && enabled === true && funded === true,
    };
  });
  const backingPrice = get("TestUSDC:price"),
    backingIdentity = get("TestUSDC:identity");
  const backingVerified =
    Array.isArray(backingIdentity) &&
    eq(backingIdentity[0], USDC.token) &&
    eq(backingIdentity[1], USDC.feed) &&
    backingIdentity[2] === false &&
    eq(get("TestUSDC:feed"), assets[4].aggregator) &&
    eq(get("TestUSDC:route"), c("ChainlinkOracleFeed"));
  const challenge = (symbol) => {
    const dual = get(`${symbol}:dual`),
      pending = get(`${symbol}:challengeable`);
    return Array.isArray(dual) && dual.length === 6 && typeof dual[4] === "boolean" && typeof pending === "boolean"
      ? dual[4] || pending
      : null;
  };
  const outputAssets = [];
  const expiries = [blockTime + STATUS_TTL_SECONDS];
  if (sourcePublic) expiries.push(sourcePublic.validUntil);
  for (const asset of assets) {
    const report = get(`${asset.symbol}:observation`),
      priceAge = get(`${asset.symbol}:ordinaryMaxAge`);
    if (Array.isArray(report) && report[0] && positive(report[1]) && positive(report[0].sourceBlockTimestamp)) {
      const deadline = Number(min(report[1], report[0].sourceBlockTimestamp)) + RELAY_MAX_AGE;
      if (deadline > blockTime) expiries.push(deadline);
      if (positive(priceAge) && positive(report[0].updatedAt) && positive(get(`${asset.symbol}:price`)))
        expiries.push(Number(report[0].updatedAt + priceAge));
      if (asset.isEquity && positive(report[0].updatedAt) && positive(get(`${asset.symbol}:closedPrice`)))
        expiries.push(Number(report[0].updatedAt) + 7 * DAY);
    }
  }
  if (Array.isArray(sequencer) && positive(sequencer[3]) && Number(sequencer[3]) + RELAY_MAX_AGE > blockTime)
    expiries.push(Number(sequencer[3]) + RELAY_MAX_AGE);
  if (sessionState === "open") expiries.push(closesAt);
  else if (nextOpenAt !== null) expiries.push(nextOpenAt);
  for (const asset of assets.filter((asset) => asset.isEquity)) {
    const prefix = asset.symbol,
      row = get(`${prefix}:observation`),
      observation = Array.isArray(row) ? row[0] : null,
      receiptTime = Array.isArray(row) ? row[1] : null;
    const observationKnown =
      observation &&
      positive(receiptTime) &&
      isUint(observation.sourceBlockTimestamp) &&
      positive(observation.updatedAt) &&
      positive(observation.sequencerStartedAt) &&
      typeof observation.oraclePaused === "boolean";
    const observedAt = observationKnown ? Number(receiptTime) : null,
      sourceBlockTimestamp = observationKnown ? Number(observation.sourceBlockTimestamp) : null;
    const relayValidUntil = observationKnown ? Math.min(observedAt, sourceBlockTimestamp) + RELAY_MAX_AGE : null;
    const fresh =
      !!observationKnown &&
      observedAt <= blockTime &&
      sourceBlockTimestamp <= blockTime &&
      blockTime < relayValidUntil &&
      get("relayPaused") === false;
    const sourcePrice = sourcePublic?.stocks.find((stock) => stock.symbol === asset.sourceSymbol);
    const openingAge = get(`${prefix}:openingMaxAge`);
    if (fresh && relayValidUntil > blockTime) expiries.push(relayValidUntil);
    if (fresh && positive(openingAge)) {
      const boundary = Number(observation.updatedAt + openingAge);
      if (boundary > blockTime) expiries.push(boundary);
    }
    const identity = get(`${prefix}:identity`);
    const assetVerified =
      Array.isArray(identity) &&
      eq(identity[0], asset.sourceToken) &&
      eq(identity[1], asset.sourceFeed) &&
      identity[2] === true &&
      eq(get(`${prefix}:feed`), asset.aggregator) &&
      eq(get(`${prefix}:route`), c("CoinbaseStockOracleFeed"));
    const poolRecord = manifest.pools.find((pool) => pool.symbol === prefix),
      poolGet = (method) => get(`pool:${prefix}:${method}`);
    let pool = { state: poolRecord ? "unknown" : "missing", terms: null, capacity: null },
      baseCodes = [],
      depositCodes = [];
    if (sourcePrice?.openingPriceFresh) expiries.push(sourcePrice.sourceUpdatedAt + 3600);
    if (!infrastructureReady || !assetVerified || !backingVerified) baseCodes.push("status-unknown");
    if (!poolRecord) baseCodes.push("pool-missing");
    let poolVerified = false,
      capacity = null,
      hasStockExposure = null;
    if (poolRecord) {
      const config = poolGet("poolConfig"),
        state = poolGet("poolState");
      const liabilities = [
        poolGet("totalShieldedTokens"),
        poolGet("totalValueAtDeposit"),
        poolGet("totalShieldCollateralAmount"),
      ];
      if (Array.isArray(state) && state.every(isUint) && liabilities.every(isUint))
        hasStockExposure = state[0] > 0n || liabilities.some((value) => value > 0n);
      poolVerified =
        eq(poolGet("POOL_FACTORY"), c("Factory")) &&
        eq(poolGet("owner"), c("Factory")) &&
        eq(poolGet("governanceTimelock"), c("Timelock")) &&
        eq(poolGet("SHIELDED_TOKEN"), asset.testToken) &&
        eq(poolGet("BACKING_TOKEN"), assets[4].testToken) &&
        Array.isArray(config) &&
        config.length === 10 &&
        eq(config[9], c("CompositeOracle")) &&
        poolGet("requiresStrictProtectedBackingPrice") === true;
      try {
        const [code, slot] = await Promise.all([
          client.getCode({ address: poolRecord.address, blockNumber: block.number }),
          client.getStorageAt({ address: poolRecord.address, slot: IMPLEMENTATION_SLOT, blockNumber: block.number }),
        ]);
        poolVerified =
          poolVerified &&
          !!code &&
          eq(keccak256(code), manifest.contracts.Factory.runtimeCodehash) &&
          typeof slot === "string" &&
          eq("0x" + slot.slice(-40), c("BasePoolRouter"));
        const nftCalls = ["shieldReceiptNFT", "protectorReceiptNFT"].flatMap((method) => {
          const nft = checkedAddress(poolGet(method));
          return [
            { address: nft, abi, functionName: "pool" },
            { address: nft, abi, functionName: "owner" },
          ];
        });
        const nftResults = await client.multicall({
          contracts: nftCalls,
          allowFailure: true,
          blockNumber: block.number,
        });
        poolVerified =
          poolVerified &&
          nftResults.length === 4 &&
          nftResults.every((result) => result.status === "success" && eq(result.result, poolRecord.address));
      } catch {
        poolVerified = false;
      }
      if (!poolVerified) baseCodes.push("status-unknown");
      if (poolGet("paused") === true) baseCodes.push("pool-paused");
      else if (poolGet("paused") !== false) baseCodes.push("status-unknown");
      if (poolGet("active") === false) depositCodes.push("pool-inactive");
      else if (poolGet("active") !== true) depositCodes.push("status-unknown");
      if (!eq(poolGet("accessControl"), zeroAddress))
        baseCodes.push(poolGet("accessControl") === null ? "status-unknown" : "account-restriction");
      if (
        !Array.isArray(state) ||
        !state.every(isUint) ||
        !isUint(poolGet("stockBalance")) ||
        !isUint(poolGet("backingBalance"))
      )
        baseCodes.push("status-unknown");
      else if (poolGet("stockBalance") < state[0] || poolGet("backingBalance") < state[1])
        baseCodes.push("accounting-uncovered");
      if (
        poolVerified &&
        config.slice(0, 7).every(isUint) &&
        isUint(config[8]) &&
        positive(poolGet("COLLATERAL_RATIO")) &&
        isUint(poolGet("COMMISSION_RATE")) &&
        isUint(poolGet("POOL_FEE"))
      ) {
        pool = {
          state: "ready",
          terms: {
            backingSymbol: "TestUSDC",
            commissionBps: Number(poolGet("COMMISSION_RATE")),
            poolFeeBps: Number(poolGet("POOL_FEE")),
            protocolFeeBps: Number(config[8]),
            collateralRatioBps: Number(poolGet("COLLATERAL_RATIO")),
            protectedExitDelaySeconds: Number(config[5]),
            collateralUnlockSeconds: Number(config[6]),
          },
          capacity: null,
        };
        try {
          capacity = calculateProtectionCapacity({
            config,
            state,
            totalValueAtDeposit: poolGet("totalValueAtDeposit"),
            totalProtectorTokens: poolGet("totalProtectorTokens"),
            totalProtectorShares: poolGet("totalProtectorShares"),
            totalShieldCollateralAmount: poolGet("totalShieldCollateralAmount"),
            ratio: poolGet("COLLATERAL_RATIO"),
            stockPrice: get(`${prefix}:price`) ?? (hasStockExposure === false ? 0n : null),
            backingPrice,
          });
          pool.capacity = capacity;
        } catch {
          /* Unknown capacity never becomes zero/available. */
        }
      }
    }
    const opening = [...baseCodes, ...depositCodes];
    if (manifest.status !== "complete") opening.unshift("deployment-incomplete");
    if (sessionState === "closed") opening.push("market-closed");
    else if (sessionState === "paused") opening.push("market-paused");
    else if (sessionState !== "open") opening.push("status-unknown");
    if (!sourcePrice) opening.push("source-unavailable");
    else if (!sourcePrice.openingPriceFresh)
      opening.push(
        sourcePrice.oraclePaused
          ? "issuer-paused"
          : !sourcePublic.sequencerUp
            ? "sequencer-unavailable"
            : "source-price-stale",
      );
    if (!fresh) opening.push("relay-stale");
    if (fresh && observation.oraclePaused) opening.push("issuer-paused");
    if (sequencerUp !== true) opening.push("sequencer-unavailable");
    if (get(`${prefix}:openingAllowed`) !== true)
      opening.push(get(`${prefix}:openingAllowed`) === null ? "status-unknown" : "price-unavailable");
    const priceCodes = [];
    if (!positive(get(`${prefix}:price`)) || !positive(backingPrice)) priceCodes.push("price-unavailable");
    for (const symbol of [prefix, "TestUSDC"]) {
      const disputed = challenge(symbol);
      if (disputed === true) priceCodes.push("oracle-disputed");
      else if (disputed === null) priceCodes.push("status-unknown");
    }
    opening.push(...priceCodes);
    if (poolGet("shieldedTokenTransferIntegrityBroken") === true) opening.push("transfer-integrity");
    else if (poolRecord && poolGet("shieldedTokenTransferIntegrityBroken") !== false) opening.push("status-unknown");
    if (poolRecord && !capacity) opening.push("capacity-unavailable");
    else if (capacity && BigInt(capacity.maxDepositBaseUnits) === 0n) opening.push("capacity-exhausted");
    const provide = [...baseCodes, ...depositCodes];
    if (manifest.status !== "complete") provide.unshift("deployment-incomplete");
    if (!positive(backingPrice)) provide.push("price-unavailable");
    if (poolRecord && hasStockExposure === null) provide.push("status-unknown");
    if (hasStockExposure === true && !positive(get(`${prefix}:price`))) provide.push("price-unavailable");
    for (const symbol of hasStockExposure === true ? ["TestUSDC", prefix] : ["TestUSDC"])
      if (challenge(symbol) !== false) provide.push(challenge(symbol) === null ? "status-unknown" : "oracle-disputed");
    if (poolRecord && !capacity) provide.push("capacity-unavailable");
    else if (capacity && BigInt(capacity.maxCollateralDepositBaseUnits) === 0n) provide.push("capacity-exhausted");
    const stockExit = [...baseCodes];
    if (!positive(get(`${prefix}:price`)) && !positive(get(`${prefix}:closedPrice`)))
      stockExit.push("price-unavailable");
    for (const symbol of [prefix, "TestUSDC"])
      if (challenge(symbol) !== false)
        stockExit.push(challenge(symbol) === null ? "status-unknown" : "oracle-disputed");
    const protectedExit = [...baseCodes, ...priceCodes];
    if (poolGet("shieldedTokenTransferIntegrityBroken") === true) protectedExit.push("transfer-integrity");
    else if (poolRecord && poolGet("shieldedTokenTransferIntegrityBroken") !== false)
      protectedExit.push("status-unknown");
    outputAssets.push({
      symbol: prefix,
      sourceSymbol: asset.sourceSymbol,
      name: asset.name,
      decimals: asset.decimals,
      sourcePrice: sourcePrice
        ? {
            priceUsd: sourcePrice.priceUsd,
            updatedAt: sourcePrice.sourceUpdatedAt,
            ageSeconds: sourcePrice.priceAgeSeconds,
            freshForOpening: sourcePrice.openingPriceFresh,
            status: sourcePrice.status,
          }
        : null,
      relay: {
        observedAt,
        sourceBlockTimestamp,
        priceUpdatedAt: observationKnown ? Number(observation.updatedAt) : null,
        validUntil: relayValidUntil,
        fresh,
        issuerPaused: fresh ? observation.oraclePaused : null,
        lastReportedIssuerPaused: observationKnown ? observation.oraclePaused : null,
        sequencerUp,
      },
      pool,
      faucet: faucetTokens.find((token) => token.symbol === prefix),
      actions: {
        openPosition: action(opening),
        withdrawStock: action(stockExit, true),
        protectedExit: action(protectedExit, true),
        provideCollateral: action(provide),
        withdrawCollateral: action(baseCodes, true),
      },
    });
  }
  const finalBlock = await client.getBlock({ blockNumber: block.number });
  assert(finalBlock.number === block.number && eq(finalBlock.hash, block.hash), "Status block reorged");
  const evaluatedAt = checkClock(),
    validUntil = Math.min(...expiries);
  assert(evaluatedAt < validUntil, "Status expired during evaluation");
  const poolsReady = outputAssets.filter((asset) => asset.pool.state === "ready").length;
  const faucetReady = faucetTokens.some((token) => token.ready);
  return {
    schemaVersion: 1,
    chainId: 84532,
    sourceChainId: 8453,
    evaluatedAt,
    validUntil,
    destination: {
      blockNumber: String(block.number),
      blockHash: block.hash,
      blockTimestamp: blockTime,
      finality: "sealed-block-with-two-block-buffer",
    },
    source: sourcePublic
      ? {
          blockNumber: sourcePublic.blockNumber,
          blockHash: sourcePublic.sourceBlockHash,
          blockTimestamp: sourcePublic.observedAt,
          validUntil: sourcePublic.validUntil,
        }
      : null,
    deployment: {
      status: manifest.status,
      verified: infrastructureReady,
      contractsConfirmed: records.length,
      transactionsConfirmed: confirmedTransactions.length,
      poolsReady,
      totalPools: 4,
      faucetReady,
      steps: [
        { code: "infrastructure", complete: infrastructureReady, label: "Deploy contracts" },
        { code: "pools", complete: poolsReady === 4, label: "Create and fund test pools" },
        { code: "faucet", complete: faucetReady, label: "Enable free test tokens" },
      ],
    },
    session: {
      state: sessionState,
      opensAt,
      closesAt,
      nextOpenAt,
      checkedThrough: allCalendarKnown ? (epochDay + CALENDAR_LOOKAHEAD_DAYS + 1) * DAY : null,
    },
    faucet: {
      verified: true,
      address: c("Faucet"),
      configured: faucetConfigured && faucetGoverned,
      ready: faucetReady,
      cooldownSeconds: isUint(get("cooldown")) ? Number(get("cooldown")) : null,
      tokens: faucetTokens,
    },
    assets: outputAssets,
  };
}

export function publicProtectionStatus(snapshot, { now = Date.now } = {}) {
  const current = seconds(now);
  assert(
    snapshot?.schemaVersion === 1 &&
      snapshot.chainId === 84532 &&
      Number.isSafeInteger(snapshot.validUntil) &&
      snapshot.evaluatedAt <= current &&
      current < snapshot.validUntil,
    "Protection status expired",
  );
  return snapshot;
}
