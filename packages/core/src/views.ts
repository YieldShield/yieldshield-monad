/**
 * Chain-neutral view models — the shapes the UI consumes. Adapters populate these from their
 * chain's native reads. Field semantics are protocol-level (shared by every implementation);
 * nothing here names a chain-specific concept.
 *
 * All amounts are bigint base units of the named token; USD values are 8-decimal bigints.
 */
import type { AccountId, PoolId, PositionId, TokenId, TxId } from "./ids.js";

// --- Tokens -------------------------------------------------------------------

export type TokenInfo = {
  token: TokenId;
  symbol: string;
  name: string;
  decimals: number;
};

/** A whitelisted (protocol-approved) token pools can be built from. */
export type SeedToken = TokenInfo & {
  /** Whitelist collateral floor (bp) — a pool's ratio must be at least this for either leg. */
  minCollateralRatioBp: bigint;
  /** Derived from the floor: ≥150% → volatile, else stable. Drives display only. */
  tranche: "stable" | "volatile";
};

export type TokenBalance = { token: SeedToken; amount: bigint };

// --- Pools ----------------------------------------------------------------------

export type PoolStats = {
  address: PoolId;
  shieldedToken: TokenId;
  backingToken: TokenId;
  /** Active flag AND not globally paused upstream — the UI still overlays oracle health. */
  active: boolean;
  /** Premium rate savers pay / protectors earn (bps). The on-chain premium signal. */
  premiumRateBp: bigint;
  poolFeeBp: bigint;
  protocolFeeBp: bigint;
  /** Required collateral ratio (bp; 10_000 = 100%). */
  collateralRatioBp: bigint;
  /** Number of open protector positions. */
  protectorPositionCount: bigint;
  /** Backing supplied vs collateral required to back savers — "Backed at X%". Null if no savers. */
  coverageBps: bigint | null;
  /** Collateral backing savers vs total protector backing — protector capacity in use. */
  utilizationBps: bigint | null;
  /** TVL cap in USD (8dp). Interpret zero according to the adapter's availability result. */
  maxTvlUsd: bigint;
  /** Shield-side USD value at deposit (8dp). Lower bound on TVL. */
  shieldTvlUsd: bigint;
  /** Fraction of the TVL cap used (bps); null when current valuation is unavailable or the cap is zero. */
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

/** Action-specific observations; the submitted transaction still requires fresh simulation. */
export type ActionEligibility = {
  state: "available" | "blocked" | "unknown";
  blockers: { code: string; message: string }[];
};

export type PoolAvailability = {
  blockNumber: bigint;
  evaluatedAt: bigint;
  validUntil: bigint;
  openPosition: ActionEligibility;
  provideCollateral: ActionEligibility;
  /** Pool limits in native deposit-token units, before the connected wallet's balance limit. */
  maxShieldedDeposit: bigint | null;
  maxBackingDeposit: bigint | null;
  trackedTvlUsd: bigint | null;
};

/** One pool, fully assembled for display (stats + token metadata + oracle health). */
export type PoolData = {
  address: PoolId;
  stats: PoolStats;
  shielded: TokenInfo;
  backing: TokenInfo;
  oracle: PoolOracleHealth;
  availability?: PoolAvailability;
};

// --- Positions ------------------------------------------------------------------

export type ShieldPositionView = {
  id: PositionId;
  pool: PoolId;
  /** Principal in shielded-token units (settled net of crystallized premium). */
  deposited: bigint;
  /** True withdrawable now (settled principal). */
  withdrawableNet: bigint;
  /** False means withdrawableNet is unavailable, not an actual zero-value quote. */
  sameAssetQuoteAvailable?: boolean;
  /** Pinned-block lifetime of the position exit checks (Unix seconds). */
  evaluatedAt?: bigint;
  validUntil?: bigint;
  sameAssetExit?: ActionEligibility;
  protectedExit?: ActionEligibility;
  protectedExitQuote?: { amount: bigint; token: TokenId; blockNumber: bigint; quotedAt: bigint };
  /** USD value at entry (8dp). */
  valueAtDepositUsd: bigint;
  /** Backing collateral attributable to this position. */
  collateralAmount: bigint;
  /** Unix seconds of the deposit. */
  depositTime: bigint;
  /** Unix seconds when the protected exit (activate protection) unlocks. */
  protectedExitUnlockTime: bigint;
  /** Whether the protected exit is available yet. */
  protectedExitUnlocked: boolean;
  /** Current USD value (8dp) at the live price; null if no feed/price. */
  currentValueUsd: bigint | null;
  /** Yield earned in USD (8dp) = max(0, currentValue − valueAtDeposit); null if no price. */
  earnedUsd: bigint | null;
};

export type ProtectorPositionView = {
  /** On-chain premium currently claimable, in shielded-token units. Undefined when unavailable. */
  claimableCommission?: bigint;
  id: PositionId;
  pool: PoolId;
  /** Collateral supplied (backing-token units). */
  collateral: bigint;
  /**
   * Estimated collateral not backing active savers. The chain enforces the exact bound on
   * withdraw; treat this as a display hint.
   */
  availableToWithdraw: bigint;
  /** Collateral currently backing active savers (collateral − availableToWithdraw). */
  backingActive: bigint;
  /** Unix seconds of the deposit. */
  depositTime: bigint;
  /** Whether a withdrawal notice has been started. */
  isUnlocking: boolean;
  /** Unix seconds when the notice completes (0 if not unlocking). */
  availableAt: bigint;
  /** Seconds remaining on the notice (0 if not unlocking or already elapsed). */
  noticeSecondsRemaining: bigint;
};

export type OwnerPositions = {
  shield: ShieldPositionView[];
  protector: ProtectorPositionView[];
};

// --- Oracle health ----------------------------------------------------------------

export type FeedHealthStatus = "healthy" | "degraded" | "paused";

export type FeedHealth = {
  token: TokenId;
  status: FeedHealthStatus;
  /** Plain reason for non-healthy states (the UI renders the calm "paused for safety" copy). */
  reason: string | null;
  /** True while the price is disputed/unverifiable — protected operations fail closed. */
  challenged: boolean;
  /** True when serving a backup feed. */
  backupActive: boolean;
  /** True when the active price is older than its staleness bound. */
  stale: boolean;
};

export type PoolOracleHealth = {
  status: FeedHealthStatus;
  /** Worst feed drives the pool status; all feeds reported for detail. */
  feeds: FeedHealth[];
  /** True when protected operations would fail-closed → show the calm "paused for safety" banner. */
  paused: boolean;
};

// --- Activity -----------------------------------------------------------------------

export type ActivityKind = "deposit" | "backing" | "withdraw" | "activate" | "collect" | "notice";

export type ActivityEntry = {
  txId: TxId;
  kind: ActivityKind;
  /** Unix seconds (block time), or null if unavailable. */
  timestamp: number | null;
  /** Amount in base units when carried by the transaction; null otherwise. */
  rawAmount: bigint | null;
  /** The asset when known; null otherwise. */
  token: TokenId | null;
};

// Re-exported here so view consumers can type owners without importing ids directly.
export type { AccountId };
