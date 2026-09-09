/**
 * Read models — UI-facing derived views over the raw on-chain accounts.
 *
 * Every model returns BOTH the raw account data and SDK-derived fields; the UI layer maps these to
 * the product's plain-money vocabulary (the SDK stays vocabulary-neutral). All amounts are bigint.
 *
 * APY caveat: protected/premium APY are *yield-source* metrics that are NOT stored on-chain. The
 * SDK surfaces the on-chain premium signal (`commissionRateBp`) and leaves the headline APY to a
 * documented per-pool config map in the app. Coverage, utilization, capacity, min/max deposit,
 * minimum-pool-time and unlock-duration are all real, on-chain values.
 */
import { isSome, type Address } from "@solana/kit";
import {
  fetchPool,
  getFeed,
  getPoolConfigForPool,
  getProtectorPosition,
  getShieldPosition,
  type FeedConfig,
  type Pool,
  type PoolConfig,
  type ProtectorPosition,
  type RpcLike,
  type ShieldPosition,
} from "./accounts.js";
import { shieldWithdrawable } from "./money.js";
import { getEffectiveFeedPrice } from "./oracle.js";
import { listAllPools, listPositionMintsHeld, type ProgramAccountsRpc, type TokenAccountsRpc } from "./discovery.js";

const BPS = 10_000n;
const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));
const ratioBps = (num: bigint, den: bigint): bigint | null => (den > 0n ? (num * BPS) / den : null);

// --- Pool stats -------------------------------------------------------------

export type PoolStats = {
  address: Address;
  pool: Pool;
  config: PoolConfig;
  /** Active flag AND not globally paused upstream — the UI still overlays oracle health. */
  active: boolean;
  /** Premium rate savers pay / protectors earn (bps). The on-chain premium signal. */
  premiumRateBp: bigint;
  poolFeeBp: bigint;
  protocolFeeBp: bigint;
  /** Backing supplied vs collateral required to back savers — "Backed at X%". Null if no savers. */
  coverageBps: bigint | null;
  /** Collateral backing savers vs total protector backing — protector capacity in use. */
  utilizationBps: bigint | null;
  /** TVL cap in USD (8dp); 0n means uncapped. */
  maxTvlUsd: bigint;
  /** Shield-side USD value at deposit (8dp). Lower bound on TVL (protector USD needs a live price). */
  shieldTvlUsd: bigint;
  /** Fraction of the TVL cap used, by shield USD (bps); null when uncapped. */
  capacityBps: bigint | null;
  /** Deposit bounds (base units); 0n means no bound. */
  shieldedMinDeposit: bigint;
  shieldedMaxDeposit: bigint;
  backingMinDeposit: bigint;
  backingMaxDeposit: bigint;
  /** Protected-exit gate and protector notice (seconds). */
  minimumPoolTime: bigint;
  unlockDuration: bigint;
  /** True if the pool gates deposits behind an access-control allowlist. */
  hasAccessControl: boolean;
};

/** Fetch + derive stats for one pool. */
export async function getPoolStats(rpc: RpcLike, poolAddress: Address): Promise<PoolStats> {
  const { data: pool } = await fetchPool(rpc, poolAddress);
  const { data: config } = await getPoolConfigForPool(rpc, poolAddress);
  return derivePoolStats(poolAddress, pool, config);
}

/** Fetch + derive stats for many pools (one round of reads each). */
export async function listPoolStats(rpc: RpcLike, poolAddresses: readonly Address[]): Promise<PoolStats[]> {
  return Promise.all(poolAddresses.map((p) => getPoolStats(rpc, p)));
}

/** Discover every on-chain pool and derive its stats. */
export async function listAllPoolStats(rpc: RpcLike & ProgramAccountsRpc): Promise<PoolStats[]> {
  const pools = await listAllPools(rpc);
  return Promise.all(
    pools.map(async ({ address, data }) => {
      const { data: config } = await getPoolConfigForPool(rpc, address);
      return derivePoolStats(address, data, config);
    }),
  );
}

/** Pure derivation from already-fetched accounts (handy for tests / batched reads). */
export function derivePoolStats(address: Address, pool: Pool, config: PoolConfig): PoolStats {
  const coverageBps = ratioBps(pool.totalProtectorTokens, pool.totalShieldCollateralAmount);
  const utilizationBps = ratioBps(pool.totalShieldCollateralAmount, pool.totalProtectorTokens);
  const capacityBps = config.maxTvlUsd > 0n ? clampBps((pool.totalValueAtDeposit * BPS) / config.maxTvlUsd) : null;
  return {
    address,
    pool,
    config,
    active: pool.active,
    premiumRateBp: pool.commissionRateBp,
    poolFeeBp: pool.poolFeeBp,
    protocolFeeBp: config.protocolFeeBp,
    coverageBps,
    utilizationBps,
    maxTvlUsd: config.maxTvlUsd,
    shieldTvlUsd: pool.totalValueAtDeposit,
    capacityBps,
    shieldedMinDeposit: config.shieldedMinDeposit,
    shieldedMaxDeposit: config.shieldedMaxDeposit,
    backingMinDeposit: config.backingMinDeposit,
    backingMaxDeposit: config.backingMaxDeposit,
    minimumPoolTime: config.minimumPoolTime,
    unlockDuration: config.unlockDuration,
    hasAccessControl: isSome(config.accessControl),
  };
}

const clampBps = (b: bigint): bigint => (b > BPS ? BPS : b);

// --- Shield (saver) position state ------------------------------------------

export type ShieldPositionState = {
  positionMint: Address;
  pool: Address;
  position: ShieldPosition;
  /** Principal in shielded-token units (settled net of crystallized premium). */
  deposited: bigint;
  /** True withdrawable now (== settled principal; call accrueFees first to settle pending premium). */
  withdrawableNet: bigint;
  /** USD value at entry (8dp). */
  valueAtDepositUsd: bigint;
  /** Backing collateral attributable to this position. */
  collateralAmount: bigint;
  /** Unix seconds when the protected exit (activate protection) unlocks. */
  protectedExitUnlockTime: bigint;
  /** Whether the protected exit is available yet. */
  protectedExitUnlocked: boolean;
  /** Current USD value (8dp) of `amount` at the live feed price; null if no feed/price. */
  currentValueUsd: bigint | null;
  /** Yield earned in USD (8dp) = max(0, currentValue − valueAtDeposit); null if no price. */
  earnedUsd: bigint | null;
};

/** Fetch + derive a saver position by its NFT mint; null if it doesn't exist. */
export async function getShieldPositionState(
  rpc: RpcLike,
  positionMint: Address,
  now: bigint = nowSeconds(),
): Promise<ShieldPositionState | null> {
  const acc = await getShieldPosition(rpc, positionMint);
  if (!acc) return null;
  const { data: pos } = acc;
  const [{ data: config }, { data: pool }] = await Promise.all([
    getPoolConfigForPool(rpc, pos.pool),
    fetchPool(rpc, pos.pool),
  ]);
  // Effective price handles both feed kinds: Manual reads the FeedConfig cache, Pyth decodes the
  // live external price account (its cache stays 0).
  const price = await getEffectiveFeedPrice(rpc, pool.shieldedMint);
  const protectedExitUnlockTime = pos.depositTime + config.minimumPoolTime;

  // Value `amount` at the live price: amount × price(8dp) / shieldedTokenScale(=10^decimals) → USD 8dp.
  let currentValueUsd: bigint | null = null;
  let earnedUsd: bigint | null = null;
  if (price && price.priceUsd8 > 0n && pool.shieldedTokenScale > 0n) {
    currentValueUsd = (pos.amount * price.priceUsd8) / pool.shieldedTokenScale;
    earnedUsd = currentValueUsd > pos.valueAtDeposit ? currentValueUsd - pos.valueAtDeposit : 0n;
  }

  return {
    positionMint,
    pool: pos.pool,
    position: pos,
    deposited: pos.amount,
    withdrawableNet: shieldWithdrawable(pos),
    valueAtDepositUsd: pos.valueAtDeposit,
    collateralAmount: pos.collateralAmount,
    protectedExitUnlockTime,
    protectedExitUnlocked: now >= protectedExitUnlockTime,
    currentValueUsd,
    earnedUsd,
  };
}

// --- Protector position state -----------------------------------------------

export type ProtectorPositionState = {
  positionMint: Address;
  pool: Address;
  position: ProtectorPosition;
  /** Collateral supplied (backing-token units). */
  collateral: bigint;
  /**
   * Estimated collateral not backing active savers — this position's pro-rata share of the pool's
   * free collateral. The on-chain withdraw enforces the exact bound; treat this as a display hint.
   */
  availableToWithdraw: bigint;
  /** Collateral currently backing active savers (collateral − availableToWithdraw). */
  backingActive: bigint;
  /** Whether a withdrawal notice has been started. */
  isUnlocking: boolean;
  /** Unix seconds when the notice completes (0 if not unlocking). */
  availableAt: bigint;
  /** Seconds remaining on the notice (0 if not unlocking or already elapsed). */
  noticeSecondsRemaining: bigint;
};

/** Fetch + derive a protector position by its NFT mint; null if it doesn't exist. */
export async function getProtectorPositionState(
  rpc: RpcLike,
  positionMint: Address,
  now: bigint = nowSeconds(),
): Promise<ProtectorPositionState | null> {
  const acc = await getProtectorPosition(rpc, positionMint);
  if (!acc) return null;
  const { data: pos } = acc;
  const { data: pool } = await fetchPool(rpc, pos.pool);
  const { data: config } = await getPoolConfigForPool(rpc, pos.pool);

  const freePoolCollateral =
    pool.totalProtectorTokens > pool.totalShieldCollateralAmount
      ? pool.totalProtectorTokens - pool.totalShieldCollateralAmount
      : 0n;
  const shareOfFree =
    pool.totalProtectorShares > 0n ? (freePoolCollateral * pos.shares) / pool.totalProtectorShares : 0n;
  const availableToWithdraw = shareOfFree < pos.amount ? shareOfFree : pos.amount;

  const isUnlocking = pos.unlockRequestTime > 0n;
  const availableAt = isUnlocking ? pos.unlockRequestTime + config.unlockDuration : 0n;
  const noticeSecondsRemaining = isUnlocking && availableAt > now ? availableAt - now : 0n;

  return {
    positionMint,
    pool: pos.pool,
    position: pos,
    collateral: pos.amount,
    availableToWithdraw,
    backingActive: pos.amount - availableToWithdraw,
    isUnlocking,
    availableAt,
    noticeSecondsRemaining,
  };
}

// --- Owner positions --------------------------------------------------------

export type OwnerPositions = {
  shield: ShieldPositionState[];
  protector: ProtectorPositionState[];
};

/** All of an owner's positions (from the position NFTs they hold), split by side. */
export async function getOwnerPositions(
  rpc: RpcLike & TokenAccountsRpc,
  owner: Address,
  now: bigint = nowSeconds(),
): Promise<OwnerPositions> {
  const mints = await listPositionMintsHeld(rpc, owner);
  const [shield, protector] = await Promise.all([
    Promise.all(mints.map((m) => getShieldPositionState(rpc, m, now))),
    Promise.all(mints.map((m) => getProtectorPositionState(rpc, m, now))),
  ]);
  return {
    shield: shield.filter((p): p is ShieldPositionState => p !== null),
    protector: protector.filter((p): p is ProtectorPositionState => p !== null),
  };
}

// --- Oracle health ----------------------------------------------------------

export type FeedHealthStatus = "healthy" | "degraded" | "paused";

export type FeedHealth = {
  tokenMint: Address;
  status: FeedHealthStatus;
  /** Plain reason for non-healthy states (the UI renders the calm "paused for safety" copy). */
  reason: string | null;
  /** True while a price challenge is open — protected reads fail-closed (revert). */
  challenged: boolean;
  /** True when serving the backup feed. */
  backupActive: boolean;
  /** True when the active price is older than `maxPriceAge`. */
  stale: boolean;
};

/** Classify a feed's health given the active slot's effective publish time (unix seconds). */
function classifyFeed(feed: FeedConfig, publishTime: bigint, now: bigint): FeedHealth {
  const challenged = isSome(feed.challenger);
  const backupActive = feed.isBackupActive;
  const stale = feed.maxPriceAge > 0n && now - publishTime > feed.maxPriceAge;

  let status: FeedHealthStatus = "healthy";
  let reason: string | null = null;
  if (challenged) {
    status = "paused";
    reason = "price under verification";
  } else if (stale) {
    status = "paused";
    reason = "price is stale";
  } else if (backupActive) {
    status = "degraded";
    reason = "serving backup feed";
  }
  return { tokenMint: feed.tokenMint, status, reason, challenged, backupActive, stale };
}

/**
 * Classify a feed's health from the FeedConfig alone, using its *cached* publish time. Correct for
 * `Manual` feeds; for `Pyth` feeds the cache is 0, so prefer the async {@link getFeedHealth}, which
 * reads the live external account. Kept for callers that already hold a FeedConfig (e.g. Manual).
 */
export function feedHealth(feed: FeedConfig, now: bigint = nowSeconds()): FeedHealth {
  const publishTime = feed.isBackupActive ? feed.backupPublishTime : feed.primaryPublishTime;
  return classifyFeed(feed, publishTime, now);
}

/**
 * Pyth-aware single-feed health: resolves the active slot's effective publish time (Manual cache or
 * live Pyth account) so a healthy external feed is not misreported as stale. Null if unconfigured.
 */
export async function getFeedHealth(rpc: RpcLike, mint: Address, now: bigint = nowSeconds()): Promise<FeedHealth | null> {
  const feed = await getFeed(rpc, mint);
  if (!feed) return null;
  const eff = await getEffectiveFeedPrice(rpc, mint);
  const publishTime =
    eff?.publishTime ?? (feed.data.isBackupActive ? feed.data.backupPublishTime : feed.data.primaryPublishTime);
  return classifyFeed(feed.data, publishTime, now);
}

export type PoolOracleHealth = {
  status: FeedHealthStatus;
  /** Worst feed drives the pool status; both feeds reported for detail. */
  feeds: FeedHealth[];
  /** True when any protected read would fail-closed → show the calm "paused for safety" banner. */
  paused: boolean;
};

const WORST: Record<FeedHealthStatus, number> = { healthy: 0, degraded: 1, paused: 2 };

/** Aggregate oracle health across a pool's shielded + backing feeds. */
export async function getPoolOracleHealth(
  rpc: RpcLike,
  shieldedMint: Address,
  backingMint: Address,
  now: bigint = nowSeconds(),
): Promise<PoolOracleHealth> {
  // Pyth-aware: getFeedHealth reads each feed's live external account when the slot isn't Manual.
  const [shielded, backing] = await Promise.all([
    getFeedHealth(rpc, shieldedMint, now),
    getFeedHealth(rpc, backingMint, now),
  ]);
  const feeds = [shielded, backing].filter((f): f is FeedHealth => f !== null);
  const status = feeds.reduce<FeedHealthStatus>(
    (worst, f) => (WORST[f.status] > WORST[worst] ? f.status : worst),
    "healthy",
  );
  return { status, feeds, paused: status === "paused" };
}
