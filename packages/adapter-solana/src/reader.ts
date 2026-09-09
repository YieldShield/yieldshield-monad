/**
 * ChainReader implementation over @yieldshield/sdk: fetch + decode Solana accounts, then map the
 * SDK's read models to the chain-neutral view models in @yieldshield/core. This is the only place
 * where kit `Address`es meet the port's plain-string ids.
 */
import { address, type Address } from "@solana/kit";
import type {
  AccountId,
  ActivityEntry,
  ChainReader,
  OwnerPositions,
  PoolData,
  PoolOracleHealth,
  PoolStats,
  ProtectorPositionView,
  SeedToken,
  ShieldPositionView,
  TokenBalance,
  TokenId,
  TokenInfo,
} from "@yieldshield/core";
import {
  ata,
  getAccountActivity,
  getPoolOracleHealth,
  getWhitelistEntry,
  listAllPoolStats,
  listWhitelistedTokens,
  getOwnerPositions,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  type PoolStats as SdkPoolStats,
  type ProtectorPositionState,
  type ShieldPositionState,
  type WhitelistEntry,
} from "@yieldshield/sdk";
import type { SolanaRpc } from "./rpc.js";

// --- View mapping (SDK read models → core view models) ---------------------------

function toPoolStats(s: SdkPoolStats): PoolStats {
  return {
    address: s.address,
    shieldedToken: s.pool.shieldedMint,
    backingToken: s.pool.backingMint,
    active: s.active,
    premiumRateBp: s.premiumRateBp,
    poolFeeBp: s.poolFeeBp,
    protocolFeeBp: s.protocolFeeBp,
    collateralRatioBp: s.pool.collateralRatioBp,
    protectorPositionCount: s.pool.protectorPositionCount,
    coverageBps: s.coverageBps,
    utilizationBps: s.utilizationBps,
    maxTvlUsd: s.maxTvlUsd,
    shieldTvlUsd: s.shieldTvlUsd,
    capacityBps: s.capacityBps,
    shieldedMinDeposit: s.shieldedMinDeposit,
    shieldedMaxDeposit: s.shieldedMaxDeposit,
    backingMinDeposit: s.backingMinDeposit,
    backingMaxDeposit: s.backingMaxDeposit,
    minimumPoolTime: s.minimumPoolTime,
    unlockDuration: s.unlockDuration,
    hasAccessControl: s.hasAccessControl,
  };
}

function toShieldView(p: ShieldPositionState): ShieldPositionView {
  return {
    id: p.positionMint,
    pool: p.pool,
    deposited: p.deposited,
    withdrawableNet: p.withdrawableNet,
    valueAtDepositUsd: p.valueAtDepositUsd,
    collateralAmount: p.collateralAmount,
    depositTime: p.position.depositTime,
    protectedExitUnlockTime: p.protectedExitUnlockTime,
    protectedExitUnlocked: p.protectedExitUnlocked,
    currentValueUsd: p.currentValueUsd,
    earnedUsd: p.earnedUsd,
  };
}

function toProtectorView(p: ProtectorPositionState): ProtectorPositionView {
  return {
    id: p.positionMint,
    pool: p.pool,
    collateral: p.collateral,
    availableToWithdraw: p.availableToWithdraw,
    backingActive: p.backingActive,
    depositTime: p.position.depositTime,
    isUnlocking: p.isUnlocking,
    availableAt: p.availableAt,
    noticeSecondsRemaining: p.noticeSecondsRemaining,
  };
}

function toTokenInfo(mint: Address, entry: { data: WhitelistEntry } | null): TokenInfo {
  if (!entry) return { token: mint, symbol: "—", name: "Token", decimals: 6 };
  return { token: mint, symbol: entry.data.symbol, name: entry.data.name, decimals: entry.data.decimals };
}

function toSeedToken(data: WhitelistEntry): SeedToken {
  return {
    token: data.mint,
    symbol: data.symbol,
    name: data.name,
    decimals: data.decimals,
    minCollateralRatioBp: data.minCollateralRatioBp,
    tranche: data.minCollateralRatioBp >= 15_000n ? "volatile" : "stable",
  };
}

// --- Reader --------------------------------------------------------------------

type ParsedTokenAccount = {
  account: { data: { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string } } } } };
};

export function createReader(rpc: SolanaRpc): ChainReader {
  /** Sum an owner's balance per mint across BOTH token programs (some assets are Token-2022). */
  async function ownedAmounts(owner: Address): Promise<Map<string, bigint>> {
    const totals = new Map<string, bigint>();
    for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
      const { value } = await rpc.getTokenAccountsByOwner(owner, { programId }, { encoding: "jsonParsed" }).send();
      for (const acc of value as unknown as ParsedTokenAccount[]) {
        const info = acc.account.data.parsed?.info;
        const amount = info?.tokenAmount?.amount;
        if (info?.mint && amount) totals.set(info.mint, (totals.get(info.mint) ?? 0n) + BigInt(amount));
      }
    }
    return totals;
  }

  async function loadSeedTokens(): Promise<SeedToken[]> {
    const rows = await listWhitelistedTokens(rpc);
    return rows.map(({ data }) => toSeedToken(data)).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  return {
    async loadPools(): Promise<PoolData[]> {
      const stats = await listAllPoolStats(rpc);
      return Promise.all(
        stats.map(async (s): Promise<PoolData> => {
          const [sh, bk, oracle] = await Promise.all([
            getWhitelistEntry(rpc, s.pool.shieldedMint),
            getWhitelistEntry(rpc, s.pool.backingMint),
            getPoolOracleHealth(rpc, s.pool.shieldedMint, s.pool.backingMint),
          ]);
          const health: PoolOracleHealth = {
            status: oracle.status,
            paused: oracle.paused,
            feeds: oracle.feeds.map((f) => ({
              token: f.tokenMint,
              status: f.status,
              reason: f.reason,
              challenged: f.challenged,
              backupActive: f.backupActive,
              stale: f.stale,
            })),
          };
          return {
            address: s.address,
            stats: toPoolStats(s),
            shielded: toTokenInfo(s.pool.shieldedMint, sh),
            backing: toTokenInfo(s.pool.backingMint, bk),
            oracle: health,
          };
        }),
      );
    },

    async getOwnerPositions(owner: AccountId): Promise<OwnerPositions> {
      const raw = await getOwnerPositions(rpc, address(owner));
      return { shield: raw.shield.map(toShieldView), protector: raw.protector.map(toProtectorView) };
    },

    listWhitelistedTokens: loadSeedTokens,

    async getTokenBalance(owner: AccountId, token: TokenId): Promise<bigint | null> {
      const account = await ata(address(token), address(owner));
      try {
        const { value } = await rpc.getTokenAccountBalance(account, { commitment: "confirmed" }).send();
        return BigInt(value.amount);
      } catch {
        return null; // no ATA yet
      }
    },

    async getBalances(owner: AccountId): Promise<TokenBalance[]> {
      const [tokens, amounts] = await Promise.all([loadSeedTokens(), ownedAmounts(address(owner))]);
      return tokens.map((token) => ({ token, amount: amounts.get(token.token) ?? 0n }));
    },

    async getActivity(owner: AccountId): Promise<ActivityEntry[]> {
      const entries = await getAccountActivity(rpc, address(owner));
      return entries.map((e) => ({
        txId: e.signature,
        kind: e.kind,
        timestamp: e.timestamp,
        rawAmount: e.rawAmount,
        token: e.mint,
      }));
    },
  };
}
