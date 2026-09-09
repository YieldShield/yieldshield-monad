/**
 * ChainReader implementation over the SplitRiskPool EVM contracts: viem multicall reads mapped to
 * the chain-neutral view models in @yieldshield/core. This is the only place where 0x addresses
 * meet the port's plain-string ids.
 *
 * Read strategy (indexer-less v1): pool discovery via the factory, position discovery by
 * enumerating receipt-NFT ids (capped), activity via event logs. Fine at current scale; swap in
 * an indexer behind this same interface if history needs outgrow RPC.
 */
import { zeroAddress, type AbiEvent, type Address, type PublicClient } from "viem";
import type {
  AccountId,
  ActionEligibility,
  PoolAvailability,
  ActivityEntry,
  ActivityKind,
  ChainReader,
  FeedHealth,
  OwnerPositions,
  PoolData,
  PoolOracleHealth,
  ProtectorPositionView,
  SeedToken,
  ShieldPositionView,
  TokenBalance,
  TokenId,
  TokenInfo,
} from "@yieldshield/core";
import { readDemoMarket, readDemoTradeQuote } from "./demo-trading.js";
import { compositeOracleAbi } from "./abis/compositeOracle.js";
import { erc20Abi } from "./abis/erc20.js";
import { protectorReceiptNftAbi } from "./abis/protectorReceiptNft.js";
import { shieldReceiptNftAbi } from "./abis/shieldReceiptNft.js";
import { splitRiskPoolAbi } from "./abis/splitRiskPool.js";
import { splitRiskPoolFactoryAbi } from "./abis/splitRiskPoolFactory.js";
import { decodePositionId, encodePositionId } from "./positionId.js";
import { readSnapshot, SNAPSHOT_VALIDITY_SECONDS } from "./snapshot.js";
import { CRYPTO_EXTENSION } from "./crypto-deployment.js";
import { assertCreatedPools } from "./pool-registry.js";

const BPS = 10_000n;
const ratioBps = (num: bigint, den: bigint): bigint | null => (den > 0n ? (num * BPS) / den : null);
const clampBps = (b: bigint): bigint => (b > BPS ? BPS : b);

/** Safety cap on receipt-NFT enumeration per pool side (testnet-scale discovery). */
const MAX_TOKEN_IDS = 2_000n;
/** Activity entries returned (newest first). */
const ACTIVITY_LIMIT = 25;
const MAX_POOLS = 1_000n;
const PROTECTOR_UNLOCK_WINDOW = 7n * 24n * 60n * 60n;
const ACTIVITY_BLOCK_RANGE = 2_000n;
const requireRead = <T>(r: Result<unknown> | undefined): T => {
  if (!r || r.status !== "success") throw new Error("On-chain data unavailable. Please refresh before continuing.");
  return r.result as T;
};
// A burned receipt is the only expected failure during ownerOf enumeration. RPC failures
// must never be counted as burned NFTs or silently hide an owner's positions.
function receiptOwner(r: Result<unknown> | undefined): Address | null {
  if (r?.status === "success") return r.result as Address;
  let error: unknown = r && r.status === "failure" ? r.error : undefined;
  const visited = new Set<unknown>();
  while (error && typeof error === "object" && !visited.has(error)) {
    visited.add(error);
    const cause = error as { data?: { errorName?: string }; cause?: unknown };
    if (cause.data?.errorName === "ERC721NonexistentToken") return null;
    error = cause.cause;
  }
  throw new Error("Position discovery data unavailable. Please refresh before continuing.");
}
const ceilDiv = (num: bigint, den: bigint): bigint => (num + den - 1n) / den;
/** Same two-stage ceil rounding and high-water mark used by SplitRiskPool fee settlement. */
export function netShieldAmount(
  amount: bigint,
  valueAtDeposit: bigint,
  feeBaseline: bigint,
  price: bigint,
  decimals: number,
  rates: readonly bigint[],
): bigint {
  if (price <= 0n) throw new Error("Current price feed unavailable for withdrawal quote.");
  const scale = 10n ** BigInt(decimals);
  const current = (amount * price) / scale;
  const baseline = feeBaseline === 0n ? valueAtDeposit : feeBaseline;
  const gain = current > baseline ? current - baseline : 0n;
  const fees = rates.reduce((total, rate) => total + ceilDiv(ceilDiv(gain * rate, BPS) * scale, price), 0n);
  return fees >= amount ? 0n : amount - fees;
}
const openingPolicyAbi = [
  {
    type: "function",
    name: "protectionOpeningEligibilityRequired",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isProtectionOpeningAllowed",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
] as const;
const ready = (): ActionEligibility => ({ state: "available", blockers: [] });
const unavailable = (code: string, message: string, state: "blocked" | "unknown" = "blocked"): ActionEligibility => ({
  state,
  blockers: [{ code, message }],
});
const VIEW_VALIDITY_SECONDS = SNAPSHOT_VALIDITY_SECONDS;
const MAX_DEPOSIT = (1n << 128n) - 1n;

export type DepositCapacityInput = {
  shieldedPrice: bigint;
  backingPrice: bigint;
  shieldedDecimals: number;
  backingDecimals: number;
  totalProtectorTokens: bigint;
  totalShieldCollateralAmount: bigint;
  totalValueAtDeposit: bigint;
  trackedTvlUsd: bigint;
  maxTvlUsd: bigint;
  collateralRatioBps: bigint;
  minDeposit: bigint;
  maxDeposit: bigint;
  totalProtectorShares?: bigint;
};
/** Exact integer predicates used by pool deposits, including both independent collateral constraints. */
export function maximumDeposit(input: DepositCapacityInput, side: "shield" | "backing"): bigint {
  const {
    shieldedPrice,
    backingPrice,
    shieldedDecimals,
    backingDecimals,
    totalProtectorTokens,
    totalShieldCollateralAmount,
    totalValueAtDeposit,
    trackedTvlUsd,
    maxTvlUsd,
    collateralRatioBps,
    minDeposit,
    maxDeposit,
  } = input;
  if (
    backingPrice <= 0n ||
    (side === "shield" && shieldedPrice <= 0n) ||
    collateralRatioBps <= 0n ||
    maxDeposit <= 0n ||
    minDeposit < 0n ||
    trackedTvlUsd >= maxTvlUsd
  )
    return 0n;
  const shieldScale = 10n ** BigInt(shieldedDecimals),
    backingScale = 10n ** BigInt(backingDecimals);
  const value = (amount: bigint) =>
    side === "shield" ? (amount * shieldedPrice) / shieldScale : (amount * backingPrice) / backingScale;
  const nativeCap = (usd: bigint) => (ceilDiv(usd * collateralRatioBps, BPS) * backingScale) / backingPrice;
  const protectorUsd = (totalProtectorTokens * backingPrice) / backingScale;
  const existingShares = totalProtectorTokens === 0n ? 0n : (input.totalProtectorShares ?? 0n);
  const mintedShares = (amount: bigint) =>
    existingShares > 0n ? (amount * existingShares) / totalProtectorTokens : (amount * 10n ** 18n) / backingScale;
  const fits = (amount: bigint) => {
    const usd = value(amount);
    return (
      trackedTvlUsd + usd <= maxTvlUsd &&
      (side === "backing"
        ? input.totalProtectorShares === undefined || existingShares + mintedShares(amount) <= 10n ** 38n
        : ceilDiv((totalValueAtDeposit + usd) * collateralRatioBps, BPS) <= protectorUsd &&
          totalShieldCollateralAmount + nativeCap(usd) <= totalProtectorTokens)
    );
  };
  let lo = 0n,
    hi = maxDeposit < MAX_DEPOSIT ? maxDeposit : MAX_DEPOSIT;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (fits(mid)) lo = mid;
    else hi = mid - 1n;
  }
  return lo < minDeposit ||
    value(lo) === 0n ||
    (side === "shield" && nativeCap(value(lo)) === 0n) ||
    (side === "backing" && input.totalProtectorShares !== undefined && mintedShares(lo) === 0n)
    ? 0n
    : lo;
}

function simulationFailure(error: unknown): ActionEligibility {
  let cause: unknown = error;
  const seen = new Set<unknown>();
  while (cause && typeof cause === "object" && !seen.has(cause)) {
    seen.add(cause);
    const e = cause as { name?: string; shortMessage?: string; cause?: unknown; data?: { errorName?: string } };
    if (e.name === "ContractFunctionRevertedError" || e.data?.errorName)
      return unavailable("preflight-failed", e.shortMessage ?? "The contract cannot execute this action now.");
    cause = e.cause;
  }
  return unavailable(
    "preflight-unavailable",
    "Withdrawal checks are unavailable. Refresh before continuing.",
    "unknown",
  );
}

const closedSessionPriceAbi = [
  {
    type: "function",
    name: "getPriceForClosedSessionExit",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export type EvmReaderDeps = {
  factory: Address;
  compositeOracle: Address;
  /** Deployment block bounds indexed activity reads on public RPC providers. */
  deploymentBlock?: bigint;
};

type Result<T> = { status: "success"; result: T } | { status: "failure"; error: Error };
const ok = <T>(r: Result<unknown> | undefined): T | null => (r && r.status === "success" ? (r.result as T) : null);

/** Untyped multicall call descriptor — results are read back through explicit `ok<T>()` casts.
 * (Letting viem infer types across hundreds of heterogeneous calls against these large ABIs
 * blows TypeScript's instantiation limit, so inference is deliberately opted out of here.) */
type RawCall = { address: Address; abi: unknown; functionName: string; args?: readonly unknown[] };

async function rawMulticall(
  client: PublicClient,
  contracts: RawCall[],
  blockNumber?: bigint,
): Promise<Result<unknown>[]> {
  if (contracts.length === 0) return [];
  const res = await client.multicall({ contracts: contracts as never, allowFailure: true, blockNumber });
  return res as Result<unknown>[];
}

/** User-facing pool events → activity kinds. Event defs are pulled from the vendored ABI so
 * signatures can never drift from the deployed contracts. */
const ACTIVITY_EVENT_KINDS: Record<string, ActivityKind> = {
  ShieldedAssetDeposited: "deposit",
  ProtectorAssetDeposited: "backing",
  ShieldedWithdrawal: "withdraw",
  PartialWithdrawal: "withdraw",
  ProtectorAssetWithdrawn: "withdraw",
  ShieldActivated: "activate",
  RewardsClaimed: "collect",
  CommissionClaimed: "collect",
  UnlockProcessStarted: "notice",
  UnlockProcessCancelled: "notice",
};

const ACTIVITY_EVENTS = splitRiskPoolAbi.filter(
  (e) => e.type === "event" && e.name in ACTIVITY_EVENT_KINDS,
) as unknown as AbiEvent[];

export function createReader(client: PublicClient, deps: EvmReaderDeps): ChainReader {
  const factory = { address: deps.factory, abi: splitRiskPoolFactoryAbi } as const;
  const poolC = (address: Address) => ({ address, abi: splitRiskPoolAbi }) as const;

  async function allPools(blockNumber: bigint): Promise<Address[]> {
    const count = await client.readContract({ ...factory, functionName: "poolCount", blockNumber });
    if (count > MAX_POOLS) throw new Error("Pool discovery limit reached. An indexer is required for a complete view.");
    if (count === 0n) return [];
    return (await client.readContract({
      ...factory,
      functionName: "getPools",
      args: [0n, count],
      blockNumber,
    })) as Address[];
  }

  /** Feed health for one token from the composite oracle's staleness/backup/challenge probes. */
  function classifyFeed(
    token: Address,
    stale: Result<readonly [boolean, bigint]> | undefined,
    backup: Result<boolean> | undefined,
    dual: Result<readonly [boolean, Address, Address, boolean, boolean, bigint]> | undefined,
    challenge: Result<boolean> | undefined,
    price: Result<bigint> | undefined,
  ): FeedHealth {
    const staleRes = ok<readonly [boolean, bigint]>(stale);
    const isStale = staleRes ? staleRes[0] : false;
    const probeFailed =
      staleRes === null ||
      ok<boolean>(backup) === null ||
      ok(dual) === null ||
      ok(challenge) === null ||
      (ok<bigint>(price) ?? 0n) <= 0n;
    const backupActive = ok<boolean>(backup) ?? false;
    const dualRes = ok<readonly [boolean, Address, Address, boolean, boolean, bigint]>(dual);
    const challenged = (dualRes ? dualRes[4] : false) || ok<boolean>(challenge) === true;

    let status: FeedHealth["status"] = "healthy";
    let reason: string | null = null;
    if (challenged) {
      status = "paused";
      reason = "price under verification";
    } else if (probeFailed) {
      // Any unavailable protected-price or safety probe is an unavailable market.
      status = "paused";
      reason = "price feed unavailable";
    } else if (isStale) {
      status = "paused";
      reason = "price is stale";
    } else if (backupActive) {
      status = "degraded";
      reason = "serving backup feed";
    }
    return { token, status, reason, challenged, backupActive, stale: isStale || probeFailed };
  }

  return {
    getDemoMarket: () => readDemoMarket(client),
    getDemoTradeQuote: (request) => readDemoTradeQuote(client, request),
    async loadPools(): Promise<PoolData[]> {
      const snapshot = await readSnapshot(client, "Pool");
      const block = snapshot.block;
      const blockNumber = block.number;
      const pools = await allPools(blockNumber);
      if (CRYPTO_EXTENSION && deps.factory.toLowerCase() === CRYPTO_EXTENSION.factory.toLowerCase())
        await assertCreatedPools(client, pools, blockNumber);
      if (pools.length === 0) return snapshot.finish([]);
      const infos = await Promise.all(
        pools.map((address) =>
          client.readContract({ ...factory, functionName: "getPoolInfo", args: [address], blockNumber }),
        ),
      );
      const poolConfigs = await rawMulticall(
        client,
        pools.map((p) => ({ ...poolC(p), functionName: "poolConfig" })),
        blockNumber,
      );
      // Keep addresses, metadata and balances pinned to one chain snapshot.
      const perPool = await rawMulticall(
        client,
        pools.flatMap((p, i) => {
          const info = infos[i]!;
          const config = requireRead<
            readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, Address, bigint, Address]
          >(poolConfigs[i]);
          const poolOracle = { address: config[9], abi: compositeOracleAbi };
          return [
            { ...poolC(p), functionName: "poolConfig" },
            { ...poolC(p), functionName: "paused" },
            { ...poolC(p), functionName: "totalProtectorTokens" },
            { ...poolC(p), functionName: "totalShieldCollateralAmount" },
            { ...poolC(p), functionName: "totalValueAtDeposit" },
            { ...poolC(p), functionName: "shieldedTokenDecimals" },
            { ...poolC(p), functionName: "backingTokenDecimals" },
            { ...poolC(p), functionName: "accessControl" },
            { ...poolC(p), functionName: "protectorReceiptNFT" },
            { ...factory, functionName: "tokenInfo", args: [info.shieldedToken] },
            { ...factory, functionName: "tokenInfo", args: [info.backingToken] },
            { ...poolOracle, functionName: "isPriceStale", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "isBackupActiveForToken", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "getTokenDualFeedStatus", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "isPriceStale", args: [info.backingToken] },
            { ...poolOracle, functionName: "isBackupActiveForToken", args: [info.backingToken] },
            { ...poolOracle, functionName: "getTokenDualFeedStatus", args: [info.backingToken] },
            { ...factory, functionName: "isPoolActive", args: [p] },
            { ...poolOracle, functionName: "isTokenChallengeable", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "isTokenChallengeable", args: [info.backingToken] },
            { ...poolOracle, functionName: "getPrice", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "getPrice", args: [info.backingToken] },
            { ...poolC(p), functionName: "poolState" },
            { ...poolC(p), functionName: "totalShieldedTokens" },
            { ...poolC(p), functionName: "requiresStrictProtectedBackingPrice" },
            { ...poolC(p), functionName: "shieldedTokenTransferIntegrityBroken" },
            { ...poolOracle, functionName: "getPriceWithStrictCircuitBreaker", args: [info.backingToken] },
            {
              address: config[9],
              abi: openingPolicyAbi,
              functionName: "protectionOpeningEligibilityRequired",
              args: [info.shieldedToken],
            },
            {
              address: config[9],
              abi: openingPolicyAbi,
              functionName: "isProtectionOpeningAllowed",
              args: [info.shieldedToken],
            },
            { ...poolC(p), functionName: "totalProtectorShares" },
          ];
        }),
        blockNumber,
      );
      const PER = 30;

      const nftAddrs = pools.map((_, i) => requireRead<Address>(perPool[i * PER + 8]));
      const nexts = await rawMulticall(
        client,
        nftAddrs.map((address) => ({ address, abi: protectorReceiptNftAbi, functionName: "nextTokenId" })),
        blockNumber,
      );
      const countCalls = nftAddrs.flatMap((address, i) => {
        const next = requireRead<bigint>(nexts[i]);
        if (next > MAX_TOKEN_IDS)
          throw new Error("Position discovery limit reached. An indexer is required for accurate counts.");
        return Array.from({ length: Number(next) }, (_, tokenId) => ({
          pool: i,
          contract: { address, abi: protectorReceiptNftAbi, functionName: "ownerOf", args: [BigInt(tokenId)] },
        }));
      });
      const countOwners = await rawMulticall(
        client,
        countCalls.map((c) => c.contract),
        blockNumber,
      );
      const counts = pools.map(() => 0n);
      countCalls.forEach((call, i) => {
        if (receiptOwner(countOwners[i])) counts[call.pool] = counts[call.pool]! + 1n;
      });

      const result = pools.map((p, i): PoolData => {
        const info = infos[i]!;
        const at = (j: number) => perPool[i * PER + j];
        const config = requireRead<
          readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, Address, bigint, Address]
        >(at(0) as Result<never>);
        const paused = requireRead<boolean>(at(1));
        const active = requireRead<boolean>(at(17));
        const totalProtectorTokens = requireRead<bigint>(at(2));
        const totalShieldCollateral = requireRead<bigint>(at(3));
        const totalValueAtDeposit = requireRead<bigint>(at(4));
        const shieldedDecimals = requireRead<number>(at(5));
        const backingDecimals = requireRead<number>(at(6));
        const accessControl = requireRead<Address>(at(7));
        const shInfo = ok<readonly [string, string, Address, Address, Address, bigint]>(at(9) as Result<never>);
        const bkInfo = ok<readonly [string, string, Address, Address, Address, bigint]>(at(10) as Result<never>);

        const shielded: TokenInfo = {
          token: info.shieldedToken,
          symbol: info.shieldedTokenSymbol,
          name: shInfo?.[0] ?? info.shieldedTokenSymbol,
          decimals: shieldedDecimals,
        };
        const backing: TokenInfo = {
          token: info.backingToken,
          symbol: info.backingTokenSymbol,
          name: bkInfo?.[0] ?? info.backingTokenSymbol,
          decimals: backingDecimals,
        };

        const feeds = [
          classifyFeed(
            info.shieldedToken,
            at(11) as Result<never>,
            at(12) as Result<never>,
            at(13) as Result<never>,
            at(18) as Result<never>,
            at(20) as Result<never>,
          ),
          classifyFeed(
            info.backingToken,
            at(14) as Result<never>,
            at(15) as Result<never>,
            at(16) as Result<never>,
            at(19) as Result<never>,
            at(21) as Result<never>,
          ),
        ];
        const worst: Record<FeedHealth["status"], number> = { healthy: 0, degraded: 1, paused: 2 };
        const status = feeds.reduce<FeedHealth["status"]>(
          (w, f) => (worst[f.status] > worst[w] ? f.status : w),
          "healthy",
        );
        const oracleHealth: PoolOracleHealth = { status, feeds, paused: status === "paused" };

        const maxTvlUsd = config[4];
        const poolState = ok<readonly [bigint, bigint]>(at(22));
        const totalShielded = ok<bigint>(at(23));
        const strict = ok<boolean>(at(24));
        const shieldedPrice = ok<bigint>(at(20));
        const backingPrice = strict === null ? null : ok<bigint>(at(strict ? 26 : 21));
        const openingRequired = ok<boolean>(at(27));
        const openingAllowed = ok<boolean>(at(28));
        const transferBroken = ok<boolean>(at(25));
        const totalProtectorShares = ok<bigint>(at(29));
        const hasShieldExposure =
          poolState === null || totalShielded === null
            ? null
            : poolState[0] !== 0n || totalShielded !== 0n || totalValueAtDeposit !== 0n || totalShieldCollateral !== 0n;
        const trackedTvlUsd =
          poolState !== null &&
          backingPrice !== null &&
          backingPrice > 0n &&
          hasShieldExposure !== null &&
          (!hasShieldExposure || (shieldedPrice !== null && shieldedPrice > 0n))
            ? (hasShieldExposure ? (poolState[0] * shieldedPrice!) / 10n ** BigInt(shieldedDecimals) : 0n) +
              (poolState[1] * backingPrice) / 10n ** BigInt(backingDecimals)
            : null;
        const capacityInput = {
          shieldedPrice: shieldedPrice ?? 0n,
          backingPrice: backingPrice ?? 0n,
          shieldedDecimals,
          backingDecimals,
          totalProtectorTokens,
          totalShieldCollateralAmount: totalShieldCollateral,
          totalValueAtDeposit,
          trackedTvlUsd: trackedTvlUsd ?? 0n,
          maxTvlUsd,
          collateralRatioBps: info.colleteralRatio,
          totalProtectorShares: totalProtectorShares ?? undefined,
        };
        const maxShieldedDeposit =
          trackedTvlUsd === null || shieldedPrice === null || shieldedPrice <= 0n
            ? null
            : maximumDeposit({ ...capacityInput, minDeposit: config[0], maxDeposit: config[1] }, "shield");
        const maxBackingDeposit =
          trackedTvlUsd === null || totalProtectorShares === null
            ? null
            : maximumDeposit({ ...capacityInput, minDeposit: config[2], maxDeposit: config[3] }, "backing");
        const eligibility = (side: "shield" | "backing"): ActionEligibility => {
          const blockers: ActionEligibility["blockers"] = [];
          let unknown = false;
          const add = (code: string, message: string, isUnknown = false) => {
            blockers.push({ code, message });
            unknown ||= isUnknown;
          };
          if (!active) add("pool-inactive", "This pool no longer accepts deposits.");
          if (paused) add("pool-paused", "This pool is paused.");
          if (side === "shield") {
            if (openingRequired === null || (openingRequired && openingAllowed === null))
              add("status-unknown", "Opening eligibility is unavailable.", true);
            else if (openingRequired && !openingAllowed)
              add("opening-unavailable", "New protection is unavailable under this asset's opening policy.");
            if (transferBroken === null) add("status-unknown", "Token transfer checks are unavailable.", true);
            else if (transferBroken) add("token-transfer-paused", "This token is paused for transfer checks.");
          }
          if (feeds[1]!.status === "paused" || backingPrice === null || backingPrice <= 0n)
            add("price-unavailable", "Backing-token pricing is unavailable.", true);
          if ((side === "shield" || hasShieldExposure !== false) && feeds[0]!.status === "paused")
            add("price-unavailable", "Stock pricing is unavailable.", true);
          const capacity = side === "shield" ? maxShieldedDeposit : maxBackingDeposit;
          if (capacity === null) add("capacity-unavailable", "Pool capacity is unavailable.", true);
          else if (capacity === 0n) add("capacity-exhausted", "This pool has no capacity for a valid deposit.");
          if (accessControl !== zeroAddress)
            add("account-restriction", "Connect a wallet to check this pool's account restrictions.", true);
          return blockers.length ? { state: unknown ? "unknown" : "blocked", blockers } : ready();
        };
        const availability: PoolAvailability = {
          blockNumber,
          evaluatedAt: block.timestamp,
          validUntil: block.timestamp + VIEW_VALIDITY_SECONDS,
          openPosition: eligibility("shield"),
          provideCollateral: eligibility("backing"),
          maxShieldedDeposit,
          maxBackingDeposit,
          trackedTvlUsd,
        };
        return {
          address: p,
          stats: {
            address: p,
            shieldedToken: info.shieldedToken,
            backingToken: info.backingToken,
            active: active && !paused,
            premiumRateBp: info.commissionRate,
            poolFeeBp: info.poolFee,
            protocolFeeBp: config?.[8] ?? 0n,
            collateralRatioBp: info.colleteralRatio,
            protectorPositionCount: counts[i]!,
            coverageBps: ratioBps(totalProtectorTokens, totalShieldCollateral),
            utilizationBps: ratioBps(totalShieldCollateral, totalProtectorTokens),
            maxTvlUsd,
            shieldTvlUsd: totalValueAtDeposit,
            capacityBps: maxTvlUsd > 0n && trackedTvlUsd !== null ? clampBps((trackedTvlUsd * BPS) / maxTvlUsd) : null,
            shieldedMinDeposit: config?.[0] ?? 0n,
            shieldedMaxDeposit: config?.[1] ?? 0n,
            backingMinDeposit: config?.[2] ?? 0n,
            backingMaxDeposit: config?.[3] ?? 0n,
            minimumPoolTime: config?.[5] ?? 0n,
            unlockDuration: config?.[6] ?? 0n,
            hasAccessControl: accessControl !== zeroAddress,
          },
          shielded,
          backing,
          oracle: oracleHealth,
          availability,
        };
      });
      return snapshot.finish(result);
    },

    async getOwnerPositions(owner: AccountId): Promise<OwnerPositions> {
      const user = owner as Address;
      const snapshot = await readSnapshot(client, "Position");
      const block = snapshot.block;
      const blockNumber = block.number;
      const now = block.timestamp;
      const pools = await allPools(blockNumber);
      if (pools.length === 0) return snapshot.finish({ shield: [], protector: [] });

      const meta = await rawMulticall(
        client,
        pools.flatMap((p) => [
          { ...poolC(p), functionName: "getUserNFTCounts", args: [user] },
          { ...poolC(p), functionName: "shieldReceiptNFT" },
          { ...poolC(p), functionName: "protectorReceiptNFT" },
          { ...poolC(p), functionName: "poolConfig" },
          { ...poolC(p), functionName: "SHIELDED_TOKEN" },
          { ...poolC(p), functionName: "shieldedTokenDecimals" },
          { ...poolC(p), functionName: "COMMISSION_RATE" },
          { ...poolC(p), functionName: "POOL_FEE" },
          { ...poolC(p), functionName: "shieldedTokenTransferIntegrityBroken" },
        ]),
        blockNumber,
      );
      const M = 9;

      type Side = {
        pool: Address;
        nft: Address;
        kind: "shield" | "protector";
        minimumPoolTime: bigint;
        unlockDuration: bigint;
        shieldedToken: Address;
        expectedCount: bigint;
        decimals: number;
        oracle: Address;
        rates: readonly bigint[];
        transferIntegrityBroken: boolean | null;
      };
      const sides: Side[] = [];
      pools.forEach((p, i) => {
        const cnt = requireRead<readonly [bigint, bigint]>(meta[i * M]);
        const config = requireRead<
          readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, Address, bigint, Address]
        >(meta[i * M + 3]);
        const shieldedToken = requireRead<Address>(meta[i * M + 4]);
        const base = {
          pool: p,
          minimumPoolTime: config[5],
          unlockDuration: config[6],
          shieldedToken,
          decimals: requireRead<number>(meta[i * M + 5]),
          oracle: config[9],
          rates: [requireRead<bigint>(meta[i * M + 6]), requireRead<bigint>(meta[i * M + 7]), config[8]],
          transferIntegrityBroken: ok<boolean>(meta[i * M + 8]),
        };
        const shieldNft = requireRead<Address>(meta[i * M + 1]);
        const protectorNft = requireRead<Address>(meta[i * M + 2]);
        if (cnt[0] > 0n) sides.push({ ...base, expectedCount: cnt[0], nft: shieldNft, kind: "shield" });
        if (cnt[1] > 0n) sides.push({ ...base, expectedCount: cnt[1], nft: protectorNft, kind: "protector" });
      });
      if (sides.length === 0) return snapshot.finish({ shield: [], protector: [] });

      // Receipt NFTs are not enumerable, so scan ownerOf over [0, nextTokenId) per side (capped).
      const nexts = await rawMulticall(
        client,
        sides.map((s) => ({ address: s.nft, abi: shieldReceiptNftAbi, functionName: "nextTokenId" as const })),
        blockNumber,
      );
      const ownerOfCalls = sides.flatMap((s, si) => {
        const next = requireRead<bigint>(nexts[si]);
        if (next > MAX_TOKEN_IDS)
          throw new Error("Position discovery limit reached. An indexer is required to list all positions.");
        const upper = next;
        return Array.from({ length: Number(upper) }, (_, t) => ({
          side: si,
          tokenId: BigInt(t),
          contract: {
            address: s.nft,
            abi: shieldReceiptNftAbi,
            functionName: "ownerOf" as const,
            args: [BigInt(t)] as const,
          },
        }));
      });
      const owners = await rawMulticall(
        client,
        ownerOfCalls.map((c) => c.contract),
        blockNumber,
      );
      const held = ownerOfCalls.filter((c, i) => receiptOwner(owners[i])?.toLowerCase() === user.toLowerCase());

      sides.forEach((s, i) => {
        if (BigInt(held.filter((h) => h.side === i).length) !== s.expectedCount)
          throw new Error("Position discovery is incomplete. Please refresh before continuing.");
      });

      // Position details + live shielded valuations, one batch.
      const details = await rawMulticall(
        client,
        held.map((h) => {
          const s = sides[h.side]!;
          return s.kind === "shield"
            ? ({ address: s.nft, abi: shieldReceiptNftAbi, functionName: "getPosition", args: [h.tokenId] } as const)
            : ({ ...poolC(s.pool), functionName: "getProtectorDepositInfo", args: [h.tokenId] } as const);
        }),
        blockNumber,
      );

      const shieldHeld = held.filter((h) => sides[h.side]!.kind === "shield");
      const values = await rawMulticall(
        client,
        shieldHeld.flatMap((h) => {
          const s = sides[h.side]!;
          const pos = requireRead<{ amount: bigint }>(details[held.indexOf(h)]);
          return [
            {
              address: s.oracle,
              abi: compositeOracleAbi,
              functionName: "getValue",
              args: [s.shieldedToken, pos.amount],
            },
            {
              address: s.oracle,
              abi: compositeOracleAbi,
              functionName: "getPriceForFeeAccrual",
              args: [s.shieldedToken],
            },
            {
              address: s.oracle,
              abi: closedSessionPriceAbi,
              functionName: "getPriceForClosedSessionExit",
              args: [s.shieldedToken],
            },
            { ...poolC(s.pool), functionName: "feeValueBaselineUsd", args: [h.tokenId] },
          ];
        }),
        blockNumber,
      );

      const shield: ShieldPositionView[] = [];
      const protector: ProtectorPositionView[] = [];
      held.forEach((h, i) => {
        const s = sides[h.side]!;
        if (s.kind === "shield") {
          const pos = requireRead<{
            amount: bigint;
            depositTime: bigint;
            valueAtDeposit: bigint;
            collateralAmount: bigint;
            lastFeeClaimTime: bigint;
          }>(details[i] as Result<never>);
          const vi = shieldHeld.indexOf(h) * 4;
          const currentValueUsd = ok<bigint>(values[vi]);
          const normalFeePrice = ok<bigint>(values[vi + 1]);
          const feePrice = normalFeePrice !== null && normalFeePrice > 0n ? normalFeePrice : ok<bigint>(values[vi + 2]);
          const baseline = ok<bigint>(values[vi + 3]);
          const ordinaryQuote = feePrice !== null && feePrice > 0n && baseline !== null;
          // The contract's recovery branch waives fee settlement after transfer integrity fails.
          const quoteAvailable =
            s.transferIntegrityBroken === true || (s.transferIntegrityBroken === false && ordinaryQuote);
          const netAmount =
            s.transferIntegrityBroken === true
              ? pos.amount
              : quoteAvailable
                ? netShieldAmount(pos.amount, pos.valueAtDeposit, baseline!, feePrice!, s.decimals, s.rates)
                : 0n;
          const depositTime = BigInt(pos.depositTime);
          const unlockAt = depositTime + s.minimumPoolTime;
          shield.push({
            id: encodePositionId(s.pool, "shield", h.tokenId),
            pool: s.pool,
            deposited: pos.amount,
            withdrawableNet: netAmount,
            sameAssetQuoteAvailable: quoteAvailable,
            evaluatedAt: now,
            validUntil: now + VIEW_VALIDITY_SECONDS,
            valueAtDepositUsd: pos.valueAtDeposit,
            collateralAmount: pos.collateralAmount,
            depositTime,
            protectedExitUnlockTime: unlockAt,
            protectedExitUnlocked: now >= unlockAt,
            currentValueUsd,
            earnedUsd:
              currentValueUsd !== null
                ? currentValueUsd > pos.valueAtDeposit
                  ? currentValueUsd - pos.valueAtDeposit
                  : 0n
                : null,
          });
        } else {
          const pos = requireRead<readonly [bigint, bigint, bigint, bigint, bigint, bigint]>(details[i]);
          const [amount, depositTime, unlockRequestTime, lockedAmount, availableAmount] = pos;
          // The contract stores the completion timestamp, not the notice-start timestamp.
          const isUnlocking = unlockRequestTime > 0n && now <= BigInt(unlockRequestTime) + PROTECTOR_UNLOCK_WINDOW;
          const availableAt = isUnlocking ? BigInt(unlockRequestTime) : 0n;
          protector.push({
            id: encodePositionId(s.pool, "protector", h.tokenId),
            pool: s.pool,
            collateral: amount,
            claimableCommission: pos[5],
            availableToWithdraw: availableAmount,
            backingActive: lockedAmount,
            depositTime: BigInt(depositTime),
            isUnlocking,
            availableAt,
            noticeSecondsRemaining: isUnlocking && availableAt > now ? availableAt - now : 0n,
          });
        }
      });
      await Promise.all(
        shield.map(async (position) => {
          const decoded = decodePositionId(position.id);
          const side = sides.find((s) => s.pool.toLowerCase() === decoded.pool.toLowerCase() && s.kind === "shield")!;
          if (!position.sameAssetQuoteAvailable)
            position.sameAssetExit = unavailable(
              "price-unavailable",
              "Stock withdrawal pricing is unavailable.",
              "unknown",
            );
          else if (position.withdrawableNet === 0n)
            position.sameAssetExit = unavailable("no-output", "No positive stock withdrawal amount is available.");
          else {
            try {
              await client.simulateContract({
                ...poolC(decoded.pool),
                functionName: "shieldedWithdraw",
                args: [decoded.tokenId, side.shieldedToken, position.withdrawableNet],
                account: user,
                blockNumber,
              });
              position.sameAssetExit = ready();
            } catch (error) {
              position.sameAssetExit = simulationFailure(error);
            }
          }
          if (!position.protectedExitUnlocked)
            position.protectedExit = unavailable(
              "withdrawal-delay",
              "This position's protected exit delay has not elapsed.",
            );
          else {
            try {
              const quote = await this.getProtectedExitQuote!(position.id);
              // Recheck for the enumerated owner: a receipt may have transferred between snapshots.
              await client.simulateContract({
                ...poolC(decoded.pool),
                functionName: "shieldedWithdraw",
                args: [decoded.tokenId, quote.token as Address, quote.amount],
                account: user,
                blockNumber: quote.blockNumber,
              });
              position.protectedExitQuote = quote;
              position.protectedExit = ready();
            } catch (error) {
              position.protectedExit = simulationFailure(error);
            }
          }
        }),
      );
      return snapshot.finish({ shield, protector });
    },

    async listWhitelistedTokens(): Promise<SeedToken[]> {
      const tokens = (await client.readContract({
        ...factory,
        functionName: "getWhitelistedTokens",
      })) as unknown as Address[];
      const meta = await rawMulticall(
        client,
        tokens.flatMap((t) => [
          { ...factory, functionName: "tokenInfo", args: [t] } as const,
          { address: t, abi: erc20Abi, functionName: "decimals" } as const,
        ]),
      );
      return tokens
        .map((t, i): SeedToken => {
          const info = requireRead<readonly [string, string, Address, Address, Address, bigint]>(meta[i * 2]);
          const minCollateralRatioBp = info?.[5] ?? 0n;
          return {
            token: t,
            symbol: info?.[1] ?? "—",
            name: info?.[0] ?? "Token",
            decimals: requireRead<number>(meta[i * 2 + 1]),
            minCollateralRatioBp,
            tranche: minCollateralRatioBp >= 15_000n ? "volatile" : "stable",
          };
        })
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
    },

    async getTokenBalance(owner: AccountId, token: TokenId): Promise<bigint | null> {
      try {
        const bal = await client.readContract({
          address: token as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner as Address],
        });
        return bal;
      } catch {
        return null;
      }
    },

    async getBalances(owner: AccountId): Promise<TokenBalance[]> {
      const tokens = await this.listWhitelistedTokens();
      const balances = await rawMulticall(
        client,
        tokens.map((t) => ({
          address: t.token as Address,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [owner as Address] as const,
        })),
      );
      return tokens.map((token, i) => ({ token, amount: requireRead<bigint>(balances[i]) }));
    },

    async getProtectedExitQuote(position) {
      const { pool, side, tokenId } = decodePositionId(position);
      if (side !== "shield") throw new Error("Position type does not match a protected exit.");
      const snapshot = await readSnapshot(client, "Protected exit");
      const block = snapshot.block;
      const blockNumber = block.number;
      await client.readContract({ ...factory, functionName: "getPoolInfo", args: [pool], blockNumber });
      const [config, nft, backingToken, decimals, paused, strict] = await Promise.all([
        client.readContract({ ...poolC(pool), functionName: "poolConfig", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "shieldReceiptNFT", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "BACKING_TOKEN", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "backingTokenDecimals", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "paused", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "requiresStrictProtectedBackingPrice", blockNumber }),
      ]);
      if (paused) throw new Error("Pool is paused.");
      const [pos, price, receiptOwner] = await Promise.all([
        client.readContract({
          address: nft,
          abi: shieldReceiptNftAbi,
          functionName: "getPosition",
          args: [tokenId],
          blockNumber,
        }),
        client.readContract({
          address: config[9],
          abi: compositeOracleAbi,
          functionName: strict ? "getPriceWithStrictCircuitBreaker" : "getPrice",
          args: [backingToken],
          blockNumber,
        }),
        client.readContract({
          address: nft,
          abi: shieldReceiptNftAbi,
          functionName: "ownerOf",
          args: [tokenId],
          blockNumber,
        }),
      ]);
      if (pos.amount === 0n || price <= 0n) throw new Error("Current price feed unavailable for exit quote.");
      const uncapped = (pos.valueAtDeposit * 10n ** BigInt(decimals)) / price;
      const amount = uncapped < pos.collateralAmount ? uncapped : pos.collateralAmount;
      if (amount <= 0n) throw new Error("No positive protected exit quote is available.");
      if (block.timestamp < BigInt(pos.depositTime) + config[5])
        throw new Error("This position's protected exit delay has not elapsed.");
      await client.simulateContract({
        ...poolC(pool),
        functionName: "shieldedWithdraw",
        args: [tokenId, backingToken, amount],
        account: receiptOwner,
        blockNumber,
      });
      return snapshot.finish({ amount, token: backingToken, blockNumber, quotedAt: block.timestamp });
    },

    async getActivity(owner: AccountId): Promise<ActivityEntry[]> {
      const user = (owner as Address).toLowerCase();
      const blockNumber = await client.getBlockNumber();
      const pools = await allPools(blockNumber);
      if (pools.length === 0) return [];
      if (deps.deploymentBlock === undefined)
        throw new Error("Activity data unavailable until the deployment block is configured.");
      const infos = await Promise.all(
        pools.map((address) =>
          client.readContract({ ...factory, functionName: "getPoolInfo", args: [address], blockNumber }),
        ),
      );
      const infoByPool = new Map(pools.map((address, i) => [address.toLowerCase(), infos[i]!]));
      const readLogs = (fromBlock: bigint, toBlock: bigint) =>
        client.getLogs({ address: pools, events: ACTIVITY_EVENTS, fromBlock, toBlock });
      const mine: Awaited<ReturnType<typeof readLogs>> = [];
      // Small windows work with public Base RPC log-range limits. Read newest windows first
      // and stop once the visible history is full; do not silently swallow RPC failures.
      for (let toBlock = blockNumber; toBlock >= deps.deploymentBlock;) {
        const fromBlock: bigint =
          toBlock - deps.deploymentBlock >= ACTIVITY_BLOCK_RANGE
            ? toBlock - ACTIVITY_BLOCK_RANGE + 1n
            : deps.deploymentBlock;
        const logs = await readLogs(fromBlock, toBlock);
        mine.push(
          ...logs.filter((log) => {
            const a = log.args as Record<string, unknown>;
            const actor = (a.depositor ?? a.withdrawer ?? a.shieldedAddress ?? a.recipient ?? a.protector ?? a.user) as
              Address | undefined;
            return actor?.toLowerCase() === user;
          }),
        );
        if (mine.length >= ACTIVITY_LIMIT * 2 || fromBlock === deps.deploymentBlock) break;
        toBlock = fromBlock - 1n;
      }
      const activated = new Set(
        mine
          .filter((log) => log.eventName === "ShieldActivated")
          .map((log) => `${log.transactionHash}:${log.address.toLowerCase()}`),
      );
      const recent = mine
        .filter(
          (log) =>
            !(
              log.eventName === "ShieldedWithdrawal" &&
              activated.has(`${log.transactionHash}:${log.address.toLowerCase()}`)
            ),
        )
        .sort((x, y) => Number((y.blockNumber ?? 0n) - (x.blockNumber ?? 0n)) || (y.logIndex ?? 0) - (x.logIndex ?? 0))
        .slice(0, ACTIVITY_LIMIT);
      const blockNumbers = [...new Set(recent.map((l) => l.blockNumber).filter((b): b is bigint => b !== null))];
      const blocks = await Promise.all(blockNumbers.map((b) => client.getBlock({ blockNumber: b }).catch(() => null)));
      const timeByBlock = new Map(blockNumbers.map((b, i) => [b, blocks[i] ? Number(blocks[i]!.timestamp) : null]));
      return recent.map((log): ActivityEntry => {
        const a = log.args as Record<string, unknown>;
        const info = infoByPool.get(log.address.toLowerCase());
        const token = (a.asset ??
          a.preferredAsset ??
          (log.eventName === "ShieldActivated"
            ? info?.backingToken
            : ["CommissionClaimed", "PartialWithdrawal"].includes(log.eventName ?? "")
              ? info?.shieldedToken
              : undefined)) as Address | undefined;
        // RewardsClaimed crystallizes premium fees; feesCharged is not a token payout.
        const amount = (a.amount ?? a.backingTokenAmount ?? a.assets ?? a.withdrawAmount) as bigint | undefined;
        return {
          txId: log.transactionHash ?? "",
          kind: ACTIVITY_EVENT_KINDS[log.eventName ?? ""] ?? "collect",
          timestamp: log.blockNumber !== null ? (timeByBlock.get(log.blockNumber) ?? null) : null,
          rawAmount: amount ?? null,
          token: token ?? null,
        };
      });
    },
  };
}
