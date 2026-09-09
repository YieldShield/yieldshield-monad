import { parseAbi } from "viem";

// Official Base B20 identities and Chainlink feeds. TRV already includes the multiplier.
// https://docs.base.org/specifications/b20/tokenized-stocks-on-base
// https://github.com/smartcontractkit/external-adapters-js/blob/db6cecc6b287b14a96dcc49c5e579894c8df452f/packages/composites/tokenized-equity/src/config/CoinbaseOracleRegistryABI.json
// Reads trust the configured RPC. The recorded block hash is provenance, not an independently
// verified state proof; the two-block offset is a short reorg buffer, not a claim of finality.
export const SOURCE_CHAIN_ID = 8453;
export const SOURCE_REGISTRY = "0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD";
export const SOURCE_SEQUENCER = "0xBCF85224fc0756B9Fa45aA7892530B47e10b6433";
export const MAX_SOURCE_BLOCK_AGE_SECONDS = 120;
export const MAX_REFERENCE_PRICE_AGE_SECONDS = 86_400;
export const MAX_OPENING_PRICE_AGE_SECONDS = 3_600;
export const SEQUENCER_GRACE_PERIOD_SECONDS = 3_600;
export const STOCKS = Object.freeze(
  [
    {
      symbol: "AAPLc",
      name: "Apple",
      token: "0xb200000000000000000000C2e324d24d7eEcd1fb",
      feed: "0x787f13dEa48Db0897CbCDD985de77809D837F988",
    },
    {
      symbol: "NVDAc",
      name: "NVIDIA",
      token: "0xb20000000000000000000078ee7ce2fE4908108C",
      feed: "0x04689a41629776563E6822F76f2e57D148d28513",
    },
    {
      symbol: "METAc",
      name: "Meta",
      token: "0xb2000000000000000000008bC8786B856E61707C",
      feed: "0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D",
    },
    {
      symbol: "GOOGLc",
      name: "Alphabet",
      token: "0xb2000000000000000000002D0BA3164cc74f58B7",
      feed: "0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2",
    },
  ].map(Object.freeze),
);
export const USDC = Object.freeze({
  symbol: "USDC",
  name: "USD Coin",
  token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  feed: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
});
const assets = Object.freeze([...STOCKS, USDC]);
const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() view returns (uint8)",
]);
const registryAbi = parseAbi(["function getOracleParams(address) view returns (uint128,bool)"]);
const maximum = (bits) => (1n << BigInt(bits)) - 1n;
const UINT80_MAX = maximum(80);
const UINT128_MAX = maximum(128);
const UINT256_MAX = maximum(256);
const INT256_MAX = maximum(255);
const isUint = (value, max = UINT256_MAX) => typeof value === "bigint" && value >= 0n && value <= max;
const sameAddress = (left, right) => typeof left === "string" && left.toLowerCase() === right.toLowerCase();

function currentSeconds(now) {
  const milliseconds = now();
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) throw new Error("Invalid observation clock");
  return BigInt(Math.floor(milliseconds / 1000));
}

function validateBlock(block, now) {
  if (
    !block ||
    !isUint(block.number, UINT80_MAX) ||
    block.number === 0n ||
    typeof block.hash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(block.hash) ||
    !isUint(block.timestamp) ||
    block.timestamp === 0n
  ) {
    throw new Error("Invalid source block identity");
  }
  // A future source timestamp would be rejected by the on-chain Sepolia relay as well.
  if (block.timestamp > now || now - block.timestamp > BigInt(MAX_SOURCE_BLOCK_AGE_SECONDS)) {
    throw new Error("Source block stale or future");
  }
}

function validateRound(round, timestamp, label, sequencer = false) {
  if (
    !Array.isArray(round) ||
    round.length !== 5 ||
    !isUint(round[0], UINT80_MAX) ||
    round[0] === 0n ||
    !isUint(round[4], UINT80_MAX) ||
    round[4] < round[0] ||
    typeof round[1] !== "bigint" ||
    (sequencer ? ![0n, 1n].includes(round[1]) : round[1] <= 0n || round[1] > INT256_MAX) ||
    !isUint(round[2]) ||
    round[2] === 0n ||
    !isUint(round[3]) ||
    round[3] < round[2] ||
    round[3] > timestamp
  ) {
    throw new Error(`Invalid ${label} source observation`);
  }
  // Sequencer updatedAt is not a price heartbeat. Its source status can legitimately remain unchanged.
}

function validateParams(params, label) {
  if (
    !Array.isArray(params) ||
    params.length !== 2 ||
    !isUint(params[0], UINT128_MAX) ||
    params[0] === 0n ||
    typeof params[1] !== "boolean"
  ) {
    throw new Error(`Invalid ${label} registry observation`);
  }
}

/** Read all public source data at one pinned Base block. This does not sign or submit anything. */
export async function readSourceSnapshot(client, { now = Date.now } = {}) {
  if ((await client.getChainId()) !== SOURCE_CHAIN_ID) throw new Error("Source RPC must be Base mainnet (8453)");
  const tip = await client.getBlockNumber({ cacheTime: 0 });
  if (!isUint(tip, UINT80_MAX) || tip <= 2n) throw new Error("Invalid source chain tip");
  const requestedBlock = tip - 2n;
  const block = await client.getBlock({ blockNumber: requestedBlock });
  validateBlock(block, currentSeconds(now));
  if (block.number !== requestedBlock) throw new Error("Source RPC returned a different block");
  const blockNumber = block.number;
  const calls = [{ address: SOURCE_SEQUENCER, abi: feedAbi, functionName: "latestRoundData" }];
  for (const asset of assets) {
    calls.push(
      { address: asset.feed, abi: feedAbi, functionName: "latestRoundData" },
      { address: asset.feed, abi: feedAbi, functionName: "decimals" },
    );
    if (asset !== USDC)
      calls.push({ address: SOURCE_REGISTRY, abi: registryAbi, functionName: "getOracleParams", args: [asset.token] });
  }
  const results = await client.multicall({ contracts: calls, allowFailure: false, blockNumber });
  if (!Array.isArray(results) || results.length !== calls.length) throw new Error("Incomplete source multicall");
  const sequencer = results[0];
  validateRound(sequencer, block.timestamp, "sequencer", true);
  let cursor = 1;
  const observations = assets.map((asset) => {
    const round = results[cursor++];
    const decimals = results[cursor++];
    // USDC is an explicit non-equity source; it has no Coinbase corporate-action registry entry.
    const params = asset === USDC ? [10n ** 18n, false] : results[cursor++];
    if (decimals !== 8) throw new Error(`Invalid ${asset.symbol} source decimals`);
    validateRound(round, block.timestamp, asset.symbol);
    validateParams(params, asset.symbol);
    const observation = {
      roundId: round[0],
      answer: round[1],
      startedAt: round[2],
      updatedAt: round[3],
      answeredInRound: round[4],
      multiplier: params[0],
      oraclePaused: params[1],
      sequencerAnswer: sequencer[1],
      sequencerStartedAt: sequencer[2],
      sourceBlockNumber: blockNumber,
      sourceBlockTimestamp: block.timestamp,
    };
    return { ...asset, round, multiplier: params[0], oraclePaused: params[1], observation };
  });
  // Slow responses must not revive a block that has expired while the RPC request was running.
  validateBlock(block, currentSeconds(now));
  return {
    chainId: SOURCE_CHAIN_ID,
    blockNumber,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    sequencer,
    assets: observations,
  };
}

/**
 * Display-only reference data. reference-available never grants permission to open protection;
 * the on-chain calendar, oracle wrapper and pool remain authoritative. Call again when serving
 * a cached raw snapshot so price ages continue to advance, and honor validUntil when caching output.
 */
export function publicSnapshot(snapshot, { now = Date.now } = {}) {
  if (snapshot?.chainId !== SOURCE_CHAIN_ID) throw new Error("Snapshot must identify Base mainnet (8453)");
  const evaluatedAt = currentSeconds(now);
  validateBlock(
    { number: snapshot.blockNumber, hash: snapshot.blockHash, timestamp: snapshot.blockTimestamp },
    evaluatedAt,
  );
  validateRound(snapshot.sequencer, snapshot.blockTimestamp, "sequencer", true);
  if (!Array.isArray(snapshot.assets) || snapshot.assets.length !== assets.length)
    throw new Error("Incomplete source assets");
  const observedAt = Number(snapshot.blockTimestamp);
  // Compute recovery conservatively at the pinned source block, not an unobserved later clock time.
  const sequencerUp =
    snapshot.sequencer[1] === 0n &&
    snapshot.blockTimestamp - snapshot.sequencer[2] > BigInt(SEQUENCER_GRACE_PERIOD_SECONDS);
  return {
    chainId: SOURCE_CHAIN_ID,
    blockNumber: String(snapshot.blockNumber),
    sourceBlockHash: snapshot.blockHash,
    observedAt,
    evaluatedAt: Number(evaluatedAt),
    validUntil: observedAt + MAX_SOURCE_BLOCK_AGE_SECONDS,
    sequencerUp,
    sourceRegistry: SOURCE_REGISTRY,
    sourceSequencer: SOURCE_SEQUENCER,
    stocks: snapshot.assets.map((asset, index) => {
      const expected = assets[index];
      if (
        !sameAddress(asset.token, expected.token) ||
        !sameAddress(asset.feed, expected.feed) ||
        asset.symbol !== expected.symbol
      ) {
        throw new Error("Snapshot asset does not match the canonical source identity");
      }
      validateRound(asset.round, snapshot.blockTimestamp, expected.symbol);
      validateParams([asset.multiplier, asset.oraclePaused], expected.symbol);
      if (expected === USDC && (asset.multiplier !== 10n ** 18n || asset.oraclePaused))
        throw new Error("Invalid USDC non-equity state");
      const priceAgeSeconds = Number(evaluatedAt - asset.round[3]);
      const usable = sequencerUp && !asset.oraclePaused;
      return {
        ...expected,
        priceUsd: Number(asset.round[1]) / 1e8,
        priceAnswer: String(asset.round[1]),
        priceDecimals: 8,
        multiplier: Number(asset.multiplier) / 1e18,
        multiplierRaw: String(asset.multiplier),
        sourceUpdatedAt: Number(asset.round[3]),
        sourceRoundId: String(asset.round[0]),
        oraclePaused: asset.oraclePaused,
        priceAgeSeconds,
        // Necessary pricing condition only; this deliberately does not assert that the market is open.
        openingPriceFresh: usable && priceAgeSeconds <= MAX_OPENING_PRICE_AGE_SECONDS,
        status: !sequencerUp
          ? "sequencer-unavailable"
          : asset.oraclePaused
            ? "oracle-paused"
            : priceAgeSeconds > MAX_REFERENCE_PRICE_AGE_SECONDS
              ? "stale"
              : "reference-available",
      };
    }),
  };
}
