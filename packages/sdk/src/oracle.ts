/**
 * Oracle CPI plumbing — resolve the external price account(s) a pool instruction must carry in its
 * transaction `remainingAccounts`.
 *
 * The pool forwards `ctx.remaining_accounts` into the composite-oracle `get_price` CPI, and the
 * oracle's adapter (Pyth/Switchboard/...) looks up its configured price account *by key* among
 * them (`feed_logic::find_account`). `Manual` feeds read a value cached on the `FeedConfig` PDA and
 * need NO external account — so this resolver returns an empty list for them and the built
 * instruction is byte-for-byte what it was before Pyth existed. That keeps one SDK working across
 * surfnet (Manual feeds) and devnet/mainnet (real Pyth feeds) with no per-cluster branching.
 */
import { AccountRole, address, isSome, type Address, type Instruction } from "@solana/kit";
import { getFeed, type RpcLike } from "./accounts.js";
import { FeedKind } from "./generated/oracle/types/feedKind.js";

/**
 * The external price account for a mint's *currently-active* feed slot (backup if a challenge has
 * switched routing, else primary), or `null` when the active slot is `Manual` or the feed is
 * unconfigured. Adapter kinds other than Manual (Pyth/Switchboard/AmmTwap/VaultNav) all read an
 * external account and thus resolve to `slot.account`.
 */
export async function activePriceAccount(rpc: RpcLike, mint: Address): Promise<Address | null> {
  const feed = await getFeed(rpc, mint);
  if (!feed) return null;
  const d = feed.data;
  const slot = d.isBackupActive && isSome(d.backup) ? d.backup.value : d.primary;
  return slot.kind === FeedKind.Manual ? null : slot.account;
}

/**
 * Resolve + dedupe the external price accounts for a set of token mints, in the given order. Pass
 * the mints an instruction's oracle CPI reads (e.g. `[shieldedMint, backingMint]` for a deposit).
 * Manual/unconfigured feeds contribute nothing.
 */
export async function resolvePriceAccounts(rpc: RpcLike, mints: readonly Address[]): Promise<Address[]> {
  const out: Address[] = [];
  const seen = new Set<string>();
  for (const mint of mints) {
    const acc = await activePriceAccount(rpc, mint);
    if (acc && !seen.has(acc)) {
      seen.add(acc);
      out.push(acc);
    }
  }
  return out;
}

/**
 * Append read-only price accounts to an instruction as Anchor `remaining_accounts`. No-op when the
 * list is empty, so a Manual-feed pool yields the original instruction unchanged.
 */
export function withRemainingAccounts<T extends Instruction>(instruction: T, accounts: readonly Address[]): T {
  if (accounts.length === 0) return instruction;
  const extra = accounts.map((address) => ({ address, role: AccountRole.READONLY }));
  return { ...instruction, accounts: [...(instruction.accounts ?? []), ...extra] };
}

/**
 * Convenience: resolve the price accounts for `mints` and append them to `instruction` in one call.
 * This is what the oracle-reading action builders use.
 */
export async function attachPriceAccounts<T extends Instruction>(
  rpc: RpcLike,
  instruction: T,
  mints: readonly Address[],
): Promise<T> {
  return withRemainingAccounts(instruction, await resolvePriceAccounts(rpc, mints));
}

// ---------------------------------------------------------------------------
// Effective feed price (read models) — Manual reads the FeedConfig cache; Pyth decodes the live
// external `PriceUpdateV2` account. This is what UI valuation / freshness must use: for a Pyth feed
// the `FeedConfig.primaryPrice/primaryPublishTime` fields stay 0 (only manual pushes populate them),
// so reading them would misreport a live feed as $0 / stale.
// ---------------------------------------------------------------------------

/** A price normalized to USD with 8 decimals, plus its publish time (unix seconds). */
export type EffectiveFeedPrice = { priceUsd8: bigint; publishTime: bigint };

function base64ToBytes(b64: string): Uint8Array {
  const g = globalThis as unknown as {
    atob?: (s: string) => string;
    Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } };
  };
  const bin = g.atob ? g.atob(b64) : g.Buffer!.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Decode a Pyth `PriceUpdateV2` account into a USD-8dp price + publish time. Layout: 8 disc +
 * 32 write_authority + verification_level (`Full`=1 byte, `Partial{num_sigs:u8}`=2 bytes) +
 * PriceFeedMessage(feed_id[32], price i64, conf u64, exponent i32, publish_time i64, ...).
 */
export function decodePriceUpdateV2(data: Uint8Array): EffectiveFeedPrice {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 8 + 32; // discriminator + write_authority
  const verification = data[off];
  off += verification === 0 ? 2 : 1; // Partial carries a num_signatures u8; Full carries nothing
  off += 32; // feed_id
  const price = dv.getBigInt64(off, true);
  off += 8 + 8; // price + conf
  const exponent = dv.getInt32(off, true);
  off += 4;
  const publishTime = dv.getBigInt64(off, true);
  // Normalize to USD 8dp: price × 10^(8 + exponent) (exponent is typically -8, i.e. no scaling).
  const shift = 8 + exponent;
  const priceUsd8 = shift >= 0 ? price * 10n ** BigInt(shift) : price / 10n ** BigInt(-shift);
  return { priceUsd8, publishTime };
}

/** Read + decode a live Pyth `PriceUpdateV2` account. Returns null if the account is missing. */
export async function readPythPriceAccount(rpc: RpcLike, account: Address): Promise<EffectiveFeedPrice | null> {
  const { value } = await rpc.getAccountInfo(account, { encoding: "base64", commitment: "confirmed" }).send();
  if (!value) return null;
  const raw = value.data;
  const b64 = Array.isArray(raw) ? raw[0] : (raw as unknown as string);
  return decodePriceUpdateV2(base64ToBytes(b64));
}

/**
 * The effective price + publish time for a mint's currently-active feed slot, normalized to USD
 * 8dp. Manual → the FeedConfig cache; Pyth → the live external account. Returns null for an
 * unconfigured feed or a not-yet-supported external kind (Switchboard/AmmTwap/VaultNav).
 */
export async function getEffectiveFeedPrice(rpc: RpcLike, mint: Address): Promise<EffectiveFeedPrice | null> {
  const feed = await getFeed(rpc, mint);
  if (!feed) return null;
  const d = feed.data;
  const backupActive = d.isBackupActive && isSome(d.backup);
  const slot = d.isBackupActive && isSome(d.backup) ? d.backup.value : d.primary;
  if (slot.kind === FeedKind.Manual) {
    return {
      priceUsd8: backupActive ? d.backupPrice : d.primaryPrice,
      publishTime: backupActive ? d.backupPublishTime : d.primaryPublishTime,
    };
  }
  if (slot.kind === FeedKind.Pyth) return readPythPriceAccount(rpc, slot.account);
  return null;
}

// ---------------------------------------------------------------------------
// Token seed catalog — the curated set of Solana collateral tokens for YieldShield, chosen as the
// ecosystem equivalents of the EVM seed (sUSDe / USDY / syrupUSDC / … + LSTs + BTC). See
// `local-docs/solana-token-selection-and-faucet.md` for the full research + rationale.
//
// This is chain-agnostic METADATA (mainnet mint, decimals, tranche, production oracle wiring). The
// devnet faucet (`app/scripts/faucet-devnet.mjs`) consumes it to stand up MOCK representations: it
// creates a fresh SPL/Token-2022 mint with the SAME `decimals`, configures a Manual feed pinned to
// `approxPriceUsd`, and whitelists it. The real mainnet `mint`/`oracle` are never used on devnet —
// the RWA Pyth feeds (USDY/sUSDe/…) aren't Pyth-sponsored on devnet and the real tokens can't be
// sourced there, which is exactly why we mint mocks.
// ---------------------------------------------------------------------------

/** Collateral bucket: `stable` → 100% min ratio (10_000 bp); `volatile` → 150% (15_000 bp). */
export type TokenTranche = "stable" | "volatile";

/** Production (mainnet) oracle wiring for a token. Devnet always uses a Manual feed regardless. */
export type TokenOracle =
  /** Direct Pyth USD feed. `feedId` is the canonical Pyth hex feed id (derive the price account via `PythSolanaReceiver`, shard 0). */
  | { readonly kind: "pyth"; readonly feedId: string; readonly altRateFeedId?: string }
  /** Composite: redemption-rate feed × underlying USD feed (for tokens with no direct USD feed). */
  | { readonly kind: "pythComposite"; readonly rateFeedId: string; readonly baseFeedId: string }
  /** NAV / share-price read (vault shares with no market feed, e.g. Kamino kTokens → `VaultNav`). */
  | { readonly kind: "vaultNav"; readonly source: string };

/** One entry in the {@link TOKEN_CATALOG}. */
export type TokenSeed = {
  readonly symbol: string;
  readonly name: string;
  /** Real mainnet SPL/Token-2022 mint. Production reference only — the faucet mints a fresh mock on devnet. */
  readonly mainnetMint: Address;
  /** Real mainnet decimals. Mock devnet mints reuse these so pool/oracle math sees production shapes (NOT uniformly 6). */
  readonly decimals: number;
  /** Underlying token program of the real token (PYUSD is Token-2022; the rest are classic SPL). */
  readonly tokenProgram: "spl" | "token2022";
  readonly tranche: TokenTranche;
  /** `minCollateralRatioBp` recorded in the WhitelistEntry: 10_000 = 100% (stable), 15_000 = 150% (volatile). */
  readonly minCollateralRatioBp: number;
  /** Production oracle wiring (mainnet). Devnet uses a Manual feed pinned to {@link approxPriceUsd}. */
  readonly oracle: TokenOracle;
  /** Realistic USD price/NAV — the value the devnet faucet pushes to the Manual feed (adjustable). */
  readonly approxPriceUsd: number;
  readonly note?: string;
};

/**
 * The recommended Solana seed set: 9 stablecoin-tranche tokens (100%) + 3 volatile (150%). USDC/USDT
 * are base $1 backing legs; the rest are the yield-bearing / volatile collateral analogous to the
 * EVM seed. All addresses/decimals verified against on-chain `getTokenSupply`; all Pyth feed ids are
 * live in Hermes. See the local-docs report for provenance and pool recommendations.
 */
export const TOKEN_CATALOG: readonly TokenSeed[] = [
  // --- base $1 backing stables --------------------------------------------------------------------
  {
    symbol: "USDC",
    name: "USD Coin",
    mainnetMint: address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    decimals: 6,
    tokenProgram: "spl",
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: { kind: "pyth", feedId: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a" },
    approxPriceUsd: 1.0,
    note: "Deepest stablecoin liquidity on Solana; Pyth-sponsored push feed. Hard-pegged 1:1 in practice.",
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    mainnetMint: address("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    decimals: 6,
    tokenProgram: "spl",
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: { kind: "pyth", feedId: "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b" },
    approxPriceUsd: 1.0,
    note: "Pyth-sponsored push feed. Hard-pegged 1:1 in practice.",
  },
  // --- yield-bearing stablecoin collateral (EVM seed analogues) -----------------------------------
  {
    symbol: "USDY",
    name: "Ondo US Dollar Yield",
    mainnetMint: address("A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6"),
    decimals: 6,
    tokenProgram: "spl",
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: {
      kind: "pyth",
      feedId: "0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326",
      altRateFeedId: "0xe3d1723999820435...USDY/USD.RR", // redemption-rate variant (NAV-style)
    },
    approxPriceUsd: 1.09,
    note: "Treasury-backed, ~4.6% APY. NAV-accruing (price rises), not a $1 peg. Direct analogue of EVM USDY.",
  },
  {
    symbol: "sUSDe",
    name: "Ethena Staked USDe",
    mainnetMint: address("Eh6XEPhSwoLv5wFApukmnaVSHQ6sAnoD9BmgmwQoN2sN"),
    decimals: 9, // NOTE: 9 decimals on Solana, not 6.
    tokenProgram: "spl",
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: { kind: "pyth", feedId: "0xca3ba9a619a4b3755c10ac7d5e760275aa95e9823d38a84fedd416856cdba37c" },
    approxPriceUsd: 1.24,
    note: "Ethena staked USDe, NAV-accruing. 9 decimals. Direct analogue of EVM sUSDe.",
  },
  {
    symbol: "USDe",
    name: "Ethena USDe",
    mainnetMint: address("DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT"),
    decimals: 9, // NOTE: 9 decimals on Solana, not 6.
    tokenProgram: "spl",
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: { kind: "pyth", feedId: "0x6ec879b1e9963de5ee97e9c8710b742d6228252a5e2ca12d4ae81d7fe5ee8c5d" },
    approxPriceUsd: 1.0,
    note: "Near-peg; yield accrues in sUSDe. 9 decimals.",
  },
  {
    symbol: "USDtb",
    name: "Ethena USDtb",
    mainnetMint: address("8yXrtJ54jZtE84xEBzTESKuegjcAkAuDrdAhRd8i8n3T"),
    decimals: 6,
    tokenProgram: "spl",
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: { kind: "pyth", feedId: "0xe4731214382d8ed70a766930a7722c68064fc7ed4e6d70dbce3c84d4be81bc92" },
    approxPriceUsd: 1.0,
    note: "BlackRock BUIDL + USDC backed, near-peg T-bill dollar.",
  },
  {
    symbol: "syrupUSDC",
    name: "Maple Syrup USDC",
    mainnetMint: address("AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj"),
    decimals: 6,
    tokenProgram: "spl",
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: {
      kind: "pyth",
      feedId: "0xe616297dab48626eaacf6d030717b25823b13ae6520b83f4735bf8deec8e2c9a",
      altRateFeedId: "0x2ad31d1c...SYRUPUSDC/USDC.RR", // RR variant preferred for a manipulation-resistant NAV
    },
    approxPriceUsd: 1.12,
    note: "Maple institutional-credit yielding dollar, ~6.5% APY, NAV-accruing. EVM ERC4626-vault analogue.",
  },
  {
    symbol: "USDS",
    name: "Sky Dollar",
    mainnetMint: address("USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA"),
    decimals: 6,
    tokenProgram: "spl",
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: { kind: "pyth", feedId: "0x77f0971af11cc8bac224917275c1bf55f2319ed5c654a1ca955c82fa2d297ea1" },
    approxPriceUsd: 1.0,
    note: "Sky (ex-DAI) dollar. Staked sUSDS does NOT exist natively on Solana yet — USDS is the only leg.",
  },
  {
    symbol: "PYUSD",
    name: "PayPal USD",
    mainnetMint: address("2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo"),
    decimals: 6,
    tokenProgram: "token2022", // NOTE: PYUSD is a Token-2022 mint, not classic SPL.
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: { kind: "pyth", feedId: "0xc1da1b73d7f01e7ddd54b3766cf7fcd644395ad14f70aa706ec5384c59e76692" },
    approxPriceUsd: 1.0,
    note: "Token-2022 program — exercises the token-2022 transfer/pool path.",
  },
  {
    symbol: "kUSDSUSDC",
    name: "Kamino kUSDS-USDC vault share",
    mainnetMint: address("FXgbpSwYpdqRqHxZyYHdrRXqg88njKbfL9DNWgarhBvB"),
    decimals: 6,
    tokenProgram: "spl",
    tranche: "stable",
    minCollateralRatioBp: 10_000,
    oracle: { kind: "vaultNav", source: "kaminoSharePrice" },
    approxPriceUsd: 1.05,
    note: "Kamino lending vault share (no market feed). Priced by share NAV → maps to FeedKind.VaultNav. EVM ERC4626 analogue.",
  },
  // --- volatile collateral (150%) -----------------------------------------------------------------
  {
    symbol: "JitoSOL",
    name: "Jito Staked SOL",
    mainnetMint: address("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"),
    decimals: 9,
    tokenProgram: "spl",
    tranche: "volatile",
    minCollateralRatioBp: 15_000,
    oracle: {
      kind: "pyth",
      feedId: "0x67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb",
      altRateFeedId: "0x01d57707...JITOSOL/SOL.RR",
    },
    approxPriceUsd: 190.0,
    note: "Largest Solana LST. Volatile — the stETH analogue.",
  },
  {
    symbol: "INF",
    name: "Sanctum Infinity",
    mainnetMint: address("5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm"),
    decimals: 9,
    tokenProgram: "spl",
    tranche: "volatile",
    minCollateralRatioBp: 15_000,
    oracle: { kind: "pyth", feedId: "0xf51570985c642c49c2d6e50156390fdba80bb6d5f7fa389d2f012ced4f7d208f" },
    approxPriceUsd: 200.0,
    note: "Sanctum multi-LST index token. Volatile.",
  },
  {
    symbol: "zBTC",
    name: "Zeus Bitcoin",
    mainnetMint: address("zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg"),
    decimals: 8,
    tokenProgram: "spl",
    tranche: "volatile",
    minCollateralRatioBp: 15_000,
    oracle: { kind: "pyth", feedId: "0x3d824c7f7c26ed1c85421ecec8c754e6b52d66a4e45de20a9c9ea91de8b396f9" },
    approxPriceUsd: 98_000.0,
    note: "BTC on Solana (8 decimals). Volatile — the LBTC analogue.",
  },
];

/** Look up a catalog entry by symbol (case-insensitive). Returns `undefined` if absent. */
export function getTokenSeed(symbol: string): TokenSeed | undefined {
  const s = symbol.toLowerCase();
  return TOKEN_CATALOG.find((t) => t.symbol.toLowerCase() === s);
}

/** Convert a token's `approxPriceUsd` to the on-chain USD-8dp integer the Manual feed expects. */
export function approxPriceUsd8(seed: TokenSeed): bigint {
  return BigInt(Math.round(seed.approxPriceUsd * 1e8));
}
