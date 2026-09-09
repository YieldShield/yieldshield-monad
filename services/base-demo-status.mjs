/** Read-only, explicitly synthetic Sepolia availability. No market feed, calendar or signer. */
import assert from "node:assert/strict";
import { getAddress, keccak256, parseAbi, toHex, zeroAddress, zeroHash } from "viem";
import { calculateProtectionCapacity } from "./base-protection-status.mjs";

export const DEMO_DEPLOYMENT_KIND = "base-sepolia-continuous-demo-v1";
export const DEMO_STATUS_TTL_SECONDS = 60;
const DEPLOYER = "0xA437345Be29EC6802024A8e090E34b621b92E5E2";
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const evidence = new WeakMap();
const symbols = ["AAPLc", "NVDAc", "METAc", "GOOGLc", "USDC"];
const basePrices = { AAPLc: "10000000000", NVDAc: "15000000000", METAc: "20000000000", GOOGLc: "12500000000" };
const names = ["Apple", "NVIDIA", "Meta", "Alphabet", "Test USDC"];
const eq = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const uint = (n) => typeof n === "bigint" && n >= 0n;
const positive = (n) => uint(n) && n > 0n;
const hash = (value) => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) && !eq(value, zeroHash);
const address = (value) => {
  assert(
    typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !eq(value, zeroAddress),
    "Invalid demo address",
  );
  return getAddress(value);
};
const seconds = (now) => {
  const n = now();
  assert(Number.isSafeInteger(n) && n > 0, "Invalid status clock");
  return Math.floor(n / 1000);
};
const messages = {
  "status-unknown": "Availability could not be verified.",
  "deployment-incomplete": "Demo setup is incomplete.",
  "pool-missing": "This test pool is being prepared.",
  "pool-paused": "This pool is paused.",
  "pool-inactive": "This pool is not accepting deposits.",
  "account-restriction": "This pool requires an account-specific access check.",
  "accounting-uncovered": "Pool balances do not cover recorded obligations.",
  "price-unavailable": "The demo price could not be verified.",
  "capacity-unavailable": "Available capacity could not be verified.",
  "capacity-exhausted": "The pool has no capacity for the minimum deposit.",
  "transfer-integrity": "This asset's transfer check needs review.",
  "position-required": "Check this position's ownership, timing and available withdrawal amount.",
  "exchange-unavailable": "The demo exchange could not be verified.",
  "liquidity-unavailable": "The demo exchange has insufficient test tokens.",
};
function action(codes, position = false) {
  const unique = [...new Set(codes)];
  if (unique.length)
    return {
      state: unique.includes("status-unknown") ? "unknown" : "blocked",
      blockers: unique.map((code) => ({ code, message: messages[code] })),
    };
  return position
    ? { state: "position-required", blockers: [{ code: "position-required", message: messages["position-required"] }] }
    : { state: "available", blockers: [] };
}
const actionNames = ["openPosition", "withdrawStock", "protectedExit", "provideCollateral", "withdrawCollateral"];
const policy = { kind: "continuous-demo", priceSource: "deterministic-onchain-demo" };
const continuous = { state: "continuous", opensAt: null, closesAt: null, nextOpenAt: null, checkedThrough: null };

/** The checked-in manifest is a reviewed inventory; its hashes are not a compiler audit. */
export function validateDemoManifest(manifest) {
  assert.equal(manifest?.schemaVersion, 2, "Wrong demo schema");
  assert.equal(manifest.deploymentKind, DEMO_DEPLOYMENT_KIND, "Unknown demo deployment kind");
  assert.equal(manifest.chainId, 84532, "Demo deployment must be Base Sepolia");
  assert(manifest.sourceChainId == null, "Demo must not identify a live source chain");
  assert(eq(manifest.deployer, DEPLOYER), "Unreviewed demo deployer");
  assert(["preparing", "complete"].includes(manifest.status), "Unknown demo setup state");
  assert(manifest.contracts && manifest.transactions && Array.isArray(manifest.assets), "Missing demo inventory");
  const used = new Set();
  for (const [name, record] of Object.entries(manifest.contracts)) {
    const target = address(record.address).toLowerCase();
    assert(!used.has(target), "Duplicate demo contract address");
    used.add(target);
    assert(hash(record.runtimeCodehash) && hash(record.txHash), "Missing demo deployment evidence");
    const tx = manifest.transactions[`deploy:${name}`];
    assert(
      tx?.status === "confirmed" && eq(tx.hash, record.txHash) && eq(tx.receipt?.transactionHash, record.txHash),
      "Missing exact demo deployment receipt",
    );
  }
  const c = (name) => address(manifest.contracts[name]?.address);
  for (const name of [
    "Timelock",
    "Factory",
    "BaseFactoryRouter",
    "BasePoolRouter",
    "CompositeOracle",
    "DemoOracle",
    "DemoExchange",
    "Faucet",
  ])
    c(name);
  assert.equal(manifest.contracts.DemoOracle.artifact, "AlphaScenarioOracle", "Wrong demo oracle artifact");
  assert.equal(manifest.contracts.DemoExchange.artifact, "AlphaStockExchange", "Wrong demo exchange artifact");
  assert(
    manifest.pricing?.kind === "deterministic-demo" &&
      eq(manifest.pricing.oracle, c("DemoOracle")) &&
      eq(manifest.pricing.exchange, c("DemoExchange")) &&
      manifest.pricing.cycleSeconds === 7200,
    "Unreviewed demo pricing configuration",
  );
  assert.deepEqual(manifest.pricing.basePrices, basePrices, "Unreviewed demo base prices");
  assert(
    !manifest.contracts.USMarketSessionGate &&
      !manifest.contracts.BaseSepoliaStockRegistry &&
      !manifest.contracts.CoinbaseStockOracleFeed,
    "Mixed legacy/demo deployment",
  );
  assert.equal(manifest.assets.length, 5, "Demo requires five test assets");
  const assets = symbols.map((symbol, i) => {
    const matches = manifest.assets.filter((asset) => asset.sourceSymbol === symbol);
    assert.equal(matches.length, 1, "Duplicate or missing demo asset");
    const asset = matches[0],
      isEquity = i < 4;
    assert(eq(asset.testToken, c(`Token:${symbol}`)), "Mixed demo token identity");
    assert.equal(manifest.contracts[`Token:${symbol}`].artifact, "BaseSepoliaAlphaToken", "Wrong demo token artifact");
    assert.equal(asset.symbol, isEquity ? `t${symbol}` : "TestUSDC");
    assert.equal(asset.decimals, isEquity ? 8 : 6);
    assert.equal(asset.isEquity, isEquity);
    assert(
      asset.sourceToken == null && asset.sourceFeed == null && asset.aggregator == null,
      "Demo asset claims a live feed",
    );
    return { ...asset, name: names[i], testToken: address(asset.testToken) };
  });
  assert(Array.isArray(manifest.pools) && manifest.pools.length <= 4, "Invalid demo pool inventory");
  const seen = new Set();
  for (const pool of manifest.pools) {
    const asset = assets.find((asset) => asset.isEquity && asset.symbol === pool.symbol);
    assert(asset && !seen.has(asset.symbol), "Duplicate or unknown demo pool");
    seen.add(asset.symbol);
    const target = address(pool.address).toLowerCase();
    assert(!used.has(target), "Mixed or duplicate demo pool");
    used.add(target);
    assert(
      eq(pool.shieldedToken, asset.testToken) && eq(pool.backingToken, assets[4].testToken),
      "Wrong demo pool assets",
    );
  }
  if (manifest.status === "complete") assert.equal(manifest.pools.length, 4, "Completed demo lacks pools");
  return { c, assets };
}

export function unavailableDemoStatus({ now = Date.now } = {}) {
  const evaluatedAt = seconds(now);
  return {
    schemaVersion: 2,
    chainId: 84532,
    sourceChainId: null,
    deploymentKind: DEMO_DEPLOYMENT_KIND,
    policy: { ...policy },
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
    session: { ...continuous },
    faucet: { verified: false, address: null, configured: false, ready: false, cooldownSeconds: null, tokens: [] },
    exchange: { verified: false, address: null, ready: false },
    assets: symbols.slice(0, 4).map((symbol, i) => ({
      symbol: `t${symbol}`,
      sourceSymbol: symbol,
      name: names[i],
      decimals: 8,
      sourcePrice: null,
      relay: null,
      executionPrice: null,
      pool: { state: "unknown", terms: null, capacity: null },
      faucet: { ready: false },
      trading: { buy: action(["status-unknown"]), sell: action(["status-unknown"]) },
      actions: Object.fromEntries(actionNames.map((name) => [name, action(["status-unknown"])])),
    })),
  };
}

async function verifyEvidence(client, manifest, block, now) {
  const digest = keccak256(toHex(JSON.stringify(manifest))),
    cached = evidence.get(client),
    at = seconds(now);
  if (cached?.digest === digest && cached.block <= block.number && cached.at <= at && at - cached.at < 600) return;
  const receipts = new Map();
  const entries = Object.entries(manifest.contracts);
  for (let i = 0; i < entries.length; i += 4)
    await Promise.all(
      entries.slice(i, i + 4).map(async ([name, record]) => {
        const [code, receipt] = await Promise.all([
          client.getCode({ address: record.address, blockNumber: block.number }),
          client.getTransactionReceipt({ hash: record.txHash }),
        ]);
        assert(code && code !== "0x" && eq(keccak256(code), record.runtimeCodehash), `${name}: demo runtime mismatch`);
        assert(
          eq(receipt.transactionHash, record.txHash) &&
            eq(receipt.contractAddress, record.address) &&
            eq(receipt.from, DEPLOYER) &&
            receipt.status === "success" &&
            receipt.blockNumber <= block.number,
          `${name}: demo deployment receipt mismatch`,
        );
        receipts.set(record.txHash, receipt);
      }),
    );
  const transactions = Object.values(manifest.transactions).filter((tx) => tx.status === "confirmed");
  for (let i = 0; i < transactions.length; i += 4)
    await Promise.all(
      transactions.slice(i, i + 4).map(async (tx) => {
        const receipt = receipts.get(tx.hash) ?? (await client.getTransactionReceipt({ hash: tx.hash }));
        assert(
          eq(receipt.transactionHash, tx.hash) &&
            eq(tx.receipt?.transactionHash, tx.hash) &&
            eq(receipt.from, DEPLOYER) &&
            receipt.status === "success" &&
            receipt.blockNumber <= block.number &&
            receipt.blockNumber === BigInt(tx.receipt.blockNumber) &&
            eq(receipt.blockHash, tx.receipt.blockHash),
          "Demo receipt identity or canonical block mismatch",
        );
        assert(hash(receipt.blockHash), "Invalid demo receipt block");
      }),
    );
  evidence.set(client, { digest, at: seconds(now), block: block.number });
}

/** Exact deterministic scenario, independently recomputed from the reviewed immutable configuration. */
export function demoPriceAt(symbol, epoch, timestamp) {
  assert(uint(epoch) && uint(timestamp) && timestamp >= epoch, "Invalid demo formula time");
  if (symbol === "USDC") return 100000000n;
  assert(Object.hasOwn(basePrices, symbol), "Unknown demo stock");
  const base = BigInt(basePrices[symbol]),
    cycle = 7200n,
    quarter = cycle / 4n,
    phase = (timestamp - epoch) % cycle;
  if (phase <= quarter) return base + (base * phase) / cycle;
  if (phase <= 2n * quarter) return base + (base * (2n * quarter - phase)) / cycle;
  if (phase <= 3n * quarter) return base - (base * (phase - 2n * quarter)) / cycle;
  return base - (base * (cycle - phase)) / cycle;
}

export function demoExchangeCapacity(price, stockInventory, usdcInventory) {
  assert(positive(price) && uint(stockInventory) && uint(usdcInventory));
  const limit = 2500000000n,
    ceil = (n, d) => (n + d - 1n) / d;
  const proceeds = (amount) => {
    const notional = (amount * price) / 10000000000n;
    return notional - ceil(notional * 30n, 10000n);
  };
  let low = 0n,
    high = limit;
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    if (proceeds(mid) <= usdcInventory) low = mid;
    else high = mid - 1n;
  }
  return {
    maxBuyStockBaseUnits: String(stockInventory < limit ? stockInventory : limit),
    maxSellStockBaseUnits: String(proceeds(low) > 0n ? low : 0n),
    requiresQuote: true,
  };
}

const abi = parseAbi([
  "function owner() view returns (address)",
  "function bootstrapModeEnabled() view returns (bool)",
  "function compositeOracle() view returns (address)",
  "function splitRiskPoolImplementation() view returns (address)",
  "function oracle() view returns (address)",
  "function quoteToken() view returns (address)",
  "function epoch() view returns (uint64)",
  "function cycleSeconds() view returns (uint64)",
  "function stockCount() view returns (uint256)",
  "function stockTokens(uint256) view returns (address)",
  "function basePrice(address) view returns (uint256)",
  "function getPrice(address) view returns (uint256)",
  "function priceAt(address,uint256) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function isSyntheticDemo() view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function getTokenOracleFeed(address) view returns (address)",
  "function getPriceWithStrictCircuitBreaker(address) view returns (uint256)",
  "function getTokenDualFeedStatus(address) view returns (bool,address,address,bool,bool,uint256)",
  "function isTokenChallengeable(address) view returns (bool)",
  "function feeBps() view returns (uint256)",
  "function maxStockAmount() view returns (uint256)",
  "function getAllTokens() view returns (address[])",
  "function COOLDOWN_PERIOD() view returns (uint256)",
  "function enabledTokens(address) view returns (bool)",
  "function dripAmount(address) view returns (uint256)",
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

export async function readDemoStatus({ client, manifest, now = Date.now }) {
  const { c, assets } = validateDemoManifest(manifest);
  assert.equal(await client.getChainId(), 84532, "Wrong demo RPC chain");
  const tip = await client.getBlockNumber({ cacheTime: 0 });
  assert(uint(tip) && tip > 2n, "Invalid sealed demo tip");
  const block = await client.getBlock({ blockNumber: tip - 2n });
  assert(block.number === tip - 2n && positive(block.timestamp) && hash(block.hash), "Invalid sealed demo block");
  const blockTime = Number(block.timestamp);
  const checkClock = () => {
    const current = seconds(now);
    assert(blockTime <= current && current - blockTime <= 120, "Stale or future demo block");
    return current;
  };
  checkClock();
  await verifyEvidence(client, manifest, block, now);
  const calls = [],
    add = (key, target, functionName, args = []) => calls.push({ key, address: target, abi, functionName, args });
  for (const [key, target, method] of [
    ["factoryOwner", "Factory", "owner"],
    ["factoryPaused", "Factory", "paused"],
    ["bootstrap", "Factory", "bootstrapModeEnabled"],
    ["factoryOracle", "Factory", "compositeOracle"],
    ["poolImplementation", "Factory", "splitRiskPoolImplementation"],
    ["compositeOwner", "CompositeOracle", "owner"],
    ["quoteToken", "DemoOracle", "quoteToken"],
    ["epoch", "DemoOracle", "epoch"],
    ["cycle", "DemoOracle", "cycleSeconds"],
    ["stockCount", "DemoOracle", "stockCount"],
    ["oracleDecimals", "DemoOracle", "decimals"],
    ["exchangeOracle", "DemoExchange", "oracle"],
    ["exchangeQuote", "DemoExchange", "quoteToken"],
    ["exchangeFee", "DemoExchange", "feeBps"],
    ["exchangeMaximum", "DemoExchange", "maxStockAmount"],
    ["faucetOwner", "Faucet", "owner"],
    ["faucetTokens", "Faucet", "getAllTokens"],
    ["cooldown", "Faucet", "COOLDOWN_PERIOD"],
  ])
    add(key, c(target), method);
  for (const [index, asset] of assets.entries()) {
    const token = asset.testToken,
      prefix = asset.symbol;
    if (asset.isEquity) add(`${prefix}:listed`, c("DemoOracle"), "stockTokens", [BigInt(index)]);
    for (const [key, target, method] of [
      ["base", "DemoOracle", "basePrice"],
      ["oraclePrice", "DemoOracle", "getPrice"],
      ["route", "CompositeOracle", "getTokenOracleFeed"],
      ["price", "CompositeOracle", asset.isEquity ? "getPrice" : "getPriceWithStrictCircuitBreaker"],
      ["dual", "CompositeOracle", "getTokenDualFeedStatus"],
      ["challengeable", "CompositeOracle", "isTokenChallengeable"],
      ["faucetEnabled", "Faucet", "enabledTokens"],
      ["dripAmount", "Faucet", "dripAmount"],
    ])
      add(`${prefix}:${key}`, c(target), method, [token]);
    add(`${prefix}:priceAt`, c("DemoOracle"), "priceAt", [token, block.timestamp]);
    for (const method of ["isSyntheticDemo", "decimals", "symbol"]) add(`${prefix}:${method}`, token, method);
    add(`${prefix}:faucetBalance`, token, "balanceOf", [c("Faucet")]);
    add(`${prefix}:exchangeBalance`, token, "balanceOf", [c("DemoExchange")]);
  }
  const poolMethods = [
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
  ];
  for (const pool of manifest.pools) {
    for (const method of poolMethods) add(`pool:${pool.symbol}:${method}`, pool.address, method);
    add(`pool:${pool.symbol}:active`, c("Factory"), "isPoolActive", [pool.address]);
    add(`pool:${pool.symbol}:stockBalance`, pool.shieldedToken, "balanceOf", [pool.address]);
    add(`pool:${pool.symbol}:backingBalance`, pool.backingToken, "balanceOf", [pool.address]);
  }
  const results = await client.multicall({
    contracts: calls.map(({ key: _key, ...call }) => call),
    allowFailure: true,
    blockNumber: block.number,
  });
  assert(Array.isArray(results) && results.length === calls.length, "Incomplete demo status reads");
  const data = new Map(calls.map((call, i) => [call.key, results[i]?.status === "success" ? results[i].result : null]));
  const get = (key) => data.get(key) ?? null;
  const proxySlot = await client.getStorageAt({
    address: c("Factory"),
    slot: IMPLEMENTATION_SLOT,
    blockNumber: block.number,
  });
  assert(
    typeof proxySlot === "string" && eq("0x" + proxySlot.slice(-40), c("BaseFactoryRouter")),
    "Demo factory implementation mismatch",
  );
  const pricing = manifest.pricing;
  const pricingConfigured =
    pricing?.kind === "deterministic-demo" &&
    eq(pricing.oracle, c("DemoOracle")) &&
    eq(pricing.exchange, c("DemoExchange")) &&
    pricing.cycleSeconds === 7200;
  const oracleReady =
    pricingConfigured &&
    eq(get("quoteToken"), assets[4].testToken) &&
    get("stockCount") === 4n &&
    get("cycle") === 7200n &&
    positive(get("epoch")) &&
    get("epoch") <= block.timestamp &&
    get("oracleDecimals") === 8;
  const infrastructureReady =
    eq(get("factoryOwner"), c("Timelock")) &&
    get("bootstrap") === false &&
    eq(get("factoryOracle"), c("CompositeOracle")) &&
    eq(get("poolImplementation"), c("BasePoolRouter")) &&
    eq(get("compositeOwner"), c("Factory")) &&
    oracleReady;
  const assetValid = (asset) => {
    const prefix = asset.symbol,
      value = get(`${prefix}:price`),
      dual = get(`${prefix}:dual`);
    const base = asset.isEquity ? pricing?.basePrices?.[asset.sourceSymbol] : "100000000";
    return (
      oracleReady &&
      (asset.isEquity ? eq(get(`${prefix}:listed`), asset.testToken) : true) &&
      get(`${prefix}:isSyntheticDemo`) === true &&
      get(`${prefix}:decimals`) === asset.decimals &&
      get(`${prefix}:symbol`) === asset.symbol &&
      typeof base === "string" &&
      /^\d+$/.test(base) &&
      BigInt(base) > 0n &&
      get(`${prefix}:base`) === BigInt(base) &&
      positive(value) &&
      value === get(`${prefix}:oraclePrice`) &&
      value === get(`${prefix}:priceAt`) &&
      value === demoPriceAt(asset.sourceSymbol, get("epoch"), block.timestamp) &&
      eq(get(`${prefix}:route`), c("DemoOracle")) &&
      Array.isArray(dual) &&
      dual.length === 6 &&
      dual[0] === false &&
      eq(dual[1], c("DemoOracle")) &&
      eq(dual[2], zeroAddress) &&
      dual[3] === false &&
      dual[4] === false &&
      get(`${prefix}:challengeable`) === false
    );
  };
  const backingValid = assetValid(assets[4]) && get("TestUSDC:price") === 100000000n;
  const inventory = get("faucetTokens");
  const faucetConfigured =
    eq(get("faucetOwner"), c("Timelock")) &&
    Array.isArray(inventory) &&
    inventory.length === assets.length &&
    assets.every((asset) => inventory.filter((token) => eq(token, asset.testToken)).length === 1);
  const faucetTokens = assets.map((asset) => {
    const enabled = get(`${asset.symbol}:faucetEnabled`),
      amount = get(`${asset.symbol}:dripAmount`),
      balance = get(`${asset.symbol}:faucetBalance`);
    const tokenValid =
      get(`${asset.symbol}:isSyntheticDemo`) === true &&
      get(`${asset.symbol}:decimals`) === asset.decimals &&
      get(`${asset.symbol}:symbol`) === asset.symbol;
    const funded = positive(amount) && uint(balance) ? balance >= amount : null;
    return {
      symbol: asset.symbol,
      sourceSymbol: asset.sourceSymbol,
      decimals: asset.decimals,
      address: asset.testToken,
      enabled: typeof enabled === "boolean" ? enabled : null,
      funded,
      dripAmountBaseUnits: uint(amount) ? String(amount) : null,
      balanceBaseUnits: uint(balance) ? String(balance) : null,
      ready: faucetConfigured && tokenValid && enabled === true && funded === true,
    };
  });
  const exchangeVerified =
    oracleReady &&
    eq(get("exchangeOracle"), c("DemoOracle")) &&
    eq(get("exchangeQuote"), assets[4].testToken) &&
    get("exchangeFee") === 30n &&
    get("exchangeMaximum") === 2500000000n;
  const backingPrice = backingValid ? get("TestUSDC:price") : null;
  const outputAssets = [];
  for (const asset of assets.filter((asset) => asset.isEquity)) {
    const prefix = asset.symbol,
      valid = assetValid(asset),
      record = manifest.pools.find((pool) => pool.symbol === prefix),
      poolGet = (key) => get(`pool:${prefix}:${key}`);
    const baseCodes = [],
      depositCodes = [];
    if (!infrastructureReady) baseCodes.push("status-unknown");
    if (!record) baseCodes.push("pool-missing");
    let pool = {
        ...(record ? { address: record.address } : {}),
        state: record ? "unknown" : "missing",
        terms: null,
        capacity: null,
      },
      capacity = null,
      poolVerified = false;
    if (record) {
      const config = poolGet("poolConfig"),
        state = poolGet("poolState");
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
          client.getCode({ address: record.address, blockNumber: block.number }),
          client.getStorageAt({ address: record.address, slot: IMPLEMENTATION_SLOT, blockNumber: block.number }),
        ]);
        poolVerified =
          poolVerified &&
          !!code &&
          code !== "0x" &&
          eq(keccak256(code), manifest.contracts.Factory.runtimeCodehash) &&
          typeof slot === "string" &&
          eq("0x" + slot.slice(-40), c("BasePoolRouter"));
        const nft1 = address(poolGet("shieldReceiptNFT")),
          nft2 = address(poolGet("protectorReceiptNFT"));
        poolVerified = poolVerified && !eq(nft1, nft2);
        const reads = await client.multicall({
          contracts: [nft1, nft2].flatMap((nft) =>
            ["pool", "owner"].map((functionName) => ({ address: nft, abi, functionName })),
          ),
          allowFailure: true,
          blockNumber: block.number,
        });
        poolVerified =
          poolVerified &&
          reads.length === 4 &&
          reads.every((r) => r.status === "success" && eq(r.result, record.address));
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
        state.length !== 2 ||
        !state.every(uint) ||
        !uint(poolGet("stockBalance")) ||
        !uint(poolGet("backingBalance"))
      )
        baseCodes.push("status-unknown");
      else if (poolGet("stockBalance") < state[0] || poolGet("backingBalance") < state[1])
        baseCodes.push("accounting-uncovered");
      if (
        poolVerified &&
        config.slice(0, 7).every(uint) &&
        uint(config[8]) &&
        positive(poolGet("COLLATERAL_RATIO")) &&
        uint(poolGet("COMMISSION_RATE")) &&
        uint(poolGet("POOL_FEE"))
      ) {
        pool = {
          address: record.address,
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
        if (valid && backingValid)
          try {
            capacity = calculateProtectionCapacity({
              config,
              state,
              totalValueAtDeposit: poolGet("totalValueAtDeposit"),
              totalProtectorTokens: poolGet("totalProtectorTokens"),
              totalProtectorShares: poolGet("totalProtectorShares"),
              totalShieldCollateralAmount: poolGet("totalShieldCollateralAmount"),
              ratio: poolGet("COLLATERAL_RATIO"),
              stockPrice: get(`${prefix}:price`),
              backingPrice,
            });
            pool.capacity = capacity;
          } catch {
            /* Unknown capacity never becomes available. */
          }
      }
    }
    if (get("factoryPaused") === true) depositCodes.push("pool-paused");
    else if (get("factoryPaused") !== false) depositCodes.push("status-unknown");
    if (manifest.status !== "complete") depositCodes.push("deployment-incomplete");
    const priceCodes = valid && backingValid ? [] : ["price-unavailable"];
    const opening = [...baseCodes, ...depositCodes, ...priceCodes],
      provide = [...baseCodes, ...depositCodes, ...priceCodes],
      exits = [...baseCodes, ...priceCodes];
    if (record && !capacity) {
      opening.push("capacity-unavailable");
      provide.push("capacity-unavailable");
    } else if (capacity) {
      if (BigInt(capacity.maxDepositBaseUnits) === 0n) opening.push("capacity-exhausted");
      if (BigInt(capacity.maxCollateralDepositBaseUnits) === 0n) provide.push("capacity-exhausted");
    }
    const protectedExit = [...exits];
    if (record && poolGet("shieldedTokenTransferIntegrityBroken") !== false) {
      const code = poolGet("shieldedTokenTransferIntegrityBroken") === true ? "transfer-integrity" : "status-unknown";
      opening.push(code);
      protectedExit.push(code);
    }
    const tradingCodes = [];
    if (!exchangeVerified || !valid || !backingValid) tradingCodes.push("exchange-unavailable");
    if (manifest.status !== "complete") tradingCodes.push("deployment-incomplete");
    const stockInventory = get(`${prefix}:exchangeBalance`),
      usdcInventory = get("TestUSDC:exchangeBalance");
    const buy = [...tradingCodes],
      sell = [...tradingCodes];
    const tradingCapacity =
      valid && uint(stockInventory) && uint(usdcInventory)
        ? demoExchangeCapacity(get(`${prefix}:price`), stockInventory, usdcInventory)
        : null;
    if (!uint(stockInventory)) buy.push("status-unknown");
    else if (stockInventory === 0n) buy.push("liquidity-unavailable");
    if (!uint(usdcInventory)) sell.push("status-unknown");
    else if (usdcInventory === 0n || tradingCapacity?.maxSellStockBaseUnits === "0") sell.push("liquidity-unavailable");
    outputAssets.push({
      symbol: prefix,
      sourceSymbol: asset.sourceSymbol,
      name: asset.name,
      decimals: asset.decimals,
      sourcePrice: null,
      relay: null,
      executionPrice: valid
        ? {
            kind: "deterministic-demo",
            priceUsd: Number(get(`${prefix}:price`)) / 1e8,
            evaluatedAt: blockTime,
            marketObservation: false,
          }
        : null,
      pool,
      faucet: faucetTokens.find((token) => token.symbol === prefix),
      trading: {
        buy: action(buy),
        sell: action(sell),
        capacity: tradingCapacity,
        stockInventoryBaseUnits: uint(stockInventory) ? String(stockInventory) : null,
        usdcInventoryBaseUnits: uint(usdcInventory) ? String(usdcInventory) : null,
        requiresQuote: true,
      },
      actions: {
        openPosition: action(opening),
        withdrawStock: action(exits, true),
        protectedExit: action(protectedExit, true),
        provideCollateral: action(provide),
        withdrawCollateral: action(baseCodes, true),
      },
    });
  }
  const finalBlock = await client.getBlock({ blockNumber: block.number });
  assert(finalBlock.number === block.number && eq(finalBlock.hash, block.hash), "Demo status block reorged");
  const evaluatedAt = checkClock(),
    validUntil = blockTime + DEMO_STATUS_TTL_SECONDS;
  assert(evaluatedAt < validUntil, "Demo status expired during evaluation");
  const poolsReady = outputAssets.filter((asset) => asset.pool.state === "ready").length,
    faucetReady = faucetTokens.some((token) => token.ready);
  return {
    schemaVersion: 2,
    chainId: 84532,
    sourceChainId: null,
    deploymentKind: DEMO_DEPLOYMENT_KIND,
    policy: { ...policy },
    evaluatedAt,
    validUntil,
    destination: {
      blockNumber: String(block.number),
      blockHash: block.hash,
      blockTimestamp: blockTime,
      finality: "sealed-block-with-two-block-buffer",
    },
    source: null,
    deployment: {
      status: manifest.status,
      verified: infrastructureReady,
      contractsConfirmed: Object.keys(manifest.contracts).length,
      transactionsConfirmed: Object.values(manifest.transactions).filter((tx) => tx.status === "confirmed").length,
      poolsReady,
      totalPools: 4,
      faucetReady,
      steps: [
        { code: "infrastructure", complete: infrastructureReady, label: "Verify demo contracts" },
        { code: "pools", complete: poolsReady === 4, label: "Create and fund test pools" },
        { code: "faucet", complete: faucetReady, label: "Enable free test tokens" },
        { code: "exchange", complete: exchangeVerified, label: "Enable demo exchange" },
      ],
    },
    session: { ...continuous },
    faucet: {
      verified: true,
      address: c("Faucet"),
      configured: faucetConfigured,
      ready: faucetReady,
      cooldownSeconds: uint(get("cooldown")) ? Number(get("cooldown")) : null,
      tokens: faucetTokens,
    },
    exchange: {
      verified: exchangeVerified,
      address: c("DemoExchange"),
      ready: outputAssets.some(
        (asset) => asset.trading.buy.state === "available" || asset.trading.sell.state === "available",
      ),
    },
    assets: outputAssets,
  };
}

export function publicDemoStatus(snapshot, { now = Date.now } = {}) {
  const current = seconds(now);
  assert(
    snapshot?.schemaVersion === 2 &&
      snapshot.chainId === 84532 &&
      snapshot.deploymentKind === DEMO_DEPLOYMENT_KIND &&
      snapshot.policy?.kind === "continuous-demo" &&
      snapshot.policy.priceSource === "deterministic-onchain-demo" &&
      snapshot.sourceChainId === null &&
      snapshot.source === null &&
      Number.isSafeInteger(snapshot.evaluatedAt) &&
      Number.isSafeInteger(snapshot.validUntil) &&
      snapshot.evaluatedAt <= current &&
      current < snapshot.validUntil &&
      snapshot.validUntil <= snapshot.evaluatedAt + 120,
    "Demo status expired or unrecognized",
  );
  return snapshot;
}
