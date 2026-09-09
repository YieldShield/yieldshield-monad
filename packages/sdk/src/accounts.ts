/**
 * Typed account fetch + decode.
 *
 * The Codama-generated decoders already assert the account discriminator before decoding, so a
 * mismatched layout throws rather than silently mis-decoding. On top of that we add an explicit
 * **owner check** in the convenience readers (defence-in-depth against untrusted RPC responses).
 *
 * Two layers:
 *   1. Re-exported generated `fetch*` / `fetchMaybe*` / `decode*` / types — import them from the SDK
 *      root instead of reaching into `generated/`.
 *   2. PDA-deriving convenience readers (`get*`) the read models + actions use: derive the PDA and
 *      fetch in one call, asserting the program owner.
 */
import { assertAccountExists, type Account, type Address, type MaybeAccount } from "@solana/kit";
import { POOL_PROGRAM_ID, ORACLE_PROGRAM_ID } from "./config.js";
import {
  feedPda,
  oracleConfigPda,
  poolConfigPda,
  protectorPositionPda,
  shieldPositionPda,
  tokenEntryPda,
} from "./pdas.js";
import {
  fetchFactory,
  fetchMaybeAllowEntry,
  fetchMaybePool,
  fetchMaybePoolConfig,
  fetchMaybeProtectorEpoch,
  fetchMaybeProtectorPosition,
  fetchMaybeShieldPosition,
  fetchMaybeWhitelistEntry,
  fetchPool,
  fetchPoolConfig,
  fetchProtectorPosition,
  fetchShieldPosition,
} from "./generated/pool/accounts/index.js";
import { fetchMaybeFeedConfig, fetchOracleConfig } from "./generated/oracle/accounts/index.js";

export type {
  AllowEntry,
  Factory,
  Pool,
  PoolConfig,
  ProtectorEpoch,
  ProtectorPosition,
  ShieldPosition,
  WhitelistEntry,
} from "./generated/pool/accounts/index.js";
export type { FeedConfig, OracleConfig } from "./generated/oracle/accounts/index.js";

// Re-export the generated readers (flat — account names don't collide across the two programs).
export {
  fetchFactory,
  fetchMaybeAllowEntry,
  fetchMaybePool,
  fetchMaybePoolConfig,
  fetchMaybeProtectorEpoch,
  fetchMaybeProtectorPosition,
  fetchMaybeShieldPosition,
  fetchMaybeWhitelistEntry,
  fetchPool,
  fetchPoolConfig,
  fetchProtectorPosition,
  fetchShieldPosition,
  fetchMaybeFeedConfig,
  fetchOracleConfig,
};

/** Minimal RPC shape the generated fetchers need (a subset of a kit RPC client). */
export type RpcLike = Parameters<typeof fetchPool>[0];

/** Assert a fetched account is owned by the expected program (untrusted-RPC guard). */
export function assertOwner<T extends { programAddress: Address }>(account: T, expected: Address): T {
  if (account.programAddress !== expected) {
    throw new Error(`account ${(account as { address?: Address }).address ?? "?"} not owned by ${expected}`);
  }
  return account;
}

// --- PDA-deriving convenience readers ---------------------------------------

/** Fetch the `PoolConfig` for a pool (derives `["config", pool]`). */
export async function getPoolConfigForPool(rpc: RpcLike, pool: Address): Promise<Account<PoolConfigT>> {
  const acc = await fetchPoolConfig(rpc, await poolConfigPda(pool));
  return assertOwner(acc, POOL_PROGRAM_ID);
}

/** Fetch a shield position by its NFT mint (derives `["shield_pos", mint]`), or null if absent. */
export async function getShieldPosition(rpc: RpcLike, positionMint: Address): Promise<Account<ShieldPositionT> | null> {
  const maybe = await fetchMaybeShieldPosition(rpc, await shieldPositionPda(positionMint));
  return existsOrNull(maybe, POOL_PROGRAM_ID);
}

/** Fetch a protector position by its NFT mint (derives `["protector_pos", mint]`), or null. */
export async function getProtectorPosition(
  rpc: RpcLike,
  positionMint: Address,
): Promise<Account<ProtectorPositionT> | null> {
  const maybe = await fetchMaybeProtectorPosition(rpc, await protectorPositionPda(positionMint));
  return existsOrNull(maybe, POOL_PROGRAM_ID);
}

/** Fetch the oracle `FeedConfig` for a token mint (derives `["feed", mint]`), or null. */
export async function getFeed(rpc: RpcLike, tokenMint: Address): Promise<Account<FeedConfigT> | null> {
  const maybe = await fetchMaybeFeedConfig(rpc, await feedPda(tokenMint));
  return existsOrNull(maybe, ORACLE_PROGRAM_ID);
}

/** Fetch a token's whitelist entry (name/symbol/decimals/feeds), or null if not whitelisted. */
export async function getWhitelistEntry(rpc: RpcLike, mint: Address): Promise<Account<WhitelistEntryT> | null> {
  const maybe = await fetchMaybeWhitelistEntry(rpc, await tokenEntryPda(mint));
  return existsOrNull(maybe, POOL_PROGRAM_ID);
}

/** Fetch the oracle config singleton. */
export async function getOracleConfig(rpc: RpcLike): Promise<Account<OracleConfigT>> {
  const acc = await fetchOracleConfig(rpc, await oracleConfigPda());
  return assertOwner(acc, ORACLE_PROGRAM_ID);
}

function existsOrNull<T extends object, A extends string>(
  maybe: MaybeAccount<T, A>,
  expectedOwner: Address,
): Account<T, A> | null {
  if (!maybe.exists) return null;
  assertAccountExists(maybe);
  return assertOwner(maybe, expectedOwner);
}

// Local type aliases (avoid re-importing the exported names above).
type PoolConfigT = import("./generated/pool/accounts/index.js").PoolConfig;
type ShieldPositionT = import("./generated/pool/accounts/index.js").ShieldPosition;
type ProtectorPositionT = import("./generated/pool/accounts/index.js").ProtectorPosition;
type FeedConfigT = import("./generated/oracle/accounts/index.js").FeedConfig;
type OracleConfigT = import("./generated/oracle/accounts/index.js").OracleConfig;
type WhitelistEntryT = import("./generated/pool/accounts/index.js").WhitelistEntry;
