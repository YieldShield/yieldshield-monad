/**
 * PDA derivation — the single source of truth for the SDK, mirroring
 * `crates/yieldshield-common/src/seeds.rs`.
 *
 * Most seeds come from the Codama-generated finders (the IDL carries the seed definitions, so they
 * match `seeds.rs` exactly). Two PDAs are NOT expressed in the IDL and are derived by hand here:
 *   - position NFT mint  `["pos_mint", pool, position_index:u64-le]`
 *   - protector epoch     `["protector_epoch", pool, epoch:u64-le]`
 *
 * Every helper returns a bare {@link Address} (the common case). The full {@link ProgramDerivedAddress}
 * (address + bump) is available from the generated `find*Pda` functions, re-exported below.
 */
import {
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Encoder,
  getUtf8Encoder,
  type Address,
  type ProgramDerivedAddress,
} from "@solana/kit";
import { POOL_PROGRAM_ID, ORACLE_PROGRAM_ID } from "./config.js";
import {
  findAllowEntryPda,
  findBondVaultPda,
  findFactoryPda,
  findPoolConfigPda,
  findPoolPda,
  findProtectorPositionPda,
  findShieldPositionPda,
  findTokenEntryPda,
  findVaultBackingPda,
  findVaultShieldedPda,
} from "./generated/pool/pdas/index.js";
import { findFeedPda, findOracleConfigPda } from "./generated/oracle/pdas/index.js";

// Re-export the generated finders for callers that need the bump.
export {
  findAllowEntryPda,
  findBondVaultPda,
  findFactoryPda,
  findPoolConfigPda,
  findPoolPda,
  findProtectorPositionPda,
  findShieldPositionPda,
  findTokenEntryPda,
  findVaultBackingPda,
  findVaultShieldedPda,
  findFeedPda,
  findOracleConfigPda,
};

const addr = (p: ProgramDerivedAddress): Address => p[0];

// --- split-risk-pool PDAs ---------------------------------------------------

/** `Factory` singleton — `["factory"]`. */
export async function factoryPda(programAddress: Address = POOL_PROGRAM_ID): Promise<Address> {
  return addr(await findFactoryPda({ programAddress }));
}

/** `WhitelistEntry` — `["token", mint]`. */
export async function tokenEntryPda(mint: Address, programAddress: Address = POOL_PROGRAM_ID): Promise<Address> {
  return addr(await findTokenEntryPda({ mint }, { programAddress }));
}

/** `Pool` — `["pool", shielded_mint, backing_mint, creator]`. */
export async function poolPda(
  seeds: { shieldedMint: Address; backingMint: Address; creator: Address },
  programAddress: Address = POOL_PROGRAM_ID,
): Promise<Address> {
  return addr(await findPoolPda(seeds, { programAddress }));
}

/** `PoolConfig` — `["config", pool]`. */
export async function poolConfigPda(pool: Address, programAddress: Address = POOL_PROGRAM_ID): Promise<Address> {
  return addr(await findPoolConfigPda({ pool }, { programAddress }));
}

/** Shielded vault token account — `["vault_shielded", pool]`. */
export async function vaultShieldedPda(pool: Address, programAddress: Address = POOL_PROGRAM_ID): Promise<Address> {
  return addr(await findVaultShieldedPda({ pool }, { programAddress }));
}

/** Backing vault token account — `["vault_backing", pool]`. */
export async function vaultBackingPda(pool: Address, programAddress: Address = POOL_PROGRAM_ID): Promise<Address> {
  return addr(await findVaultBackingPda({ pool }, { programAddress }));
}

/** Creation-bond escrow — `["bond", pool]`. */
export async function bondVaultPda(pool: Address, programAddress: Address = POOL_PROGRAM_ID): Promise<Address> {
  return addr(await findBondVaultPda({ pool }, { programAddress }));
}

/** `ShieldPosition` data — `["shield_pos", position_mint]`. */
export async function shieldPositionPda(
  positionMint: Address,
  programAddress: Address = POOL_PROGRAM_ID,
): Promise<Address> {
  return addr(await findShieldPositionPda({ positionMint }, { programAddress }));
}

/** `ProtectorPosition` data — `["protector_pos", position_mint]`. */
export async function protectorPositionPda(
  positionMint: Address,
  programAddress: Address = POOL_PROGRAM_ID,
): Promise<Address> {
  return addr(await findProtectorPositionPda({ positionMint }, { programAddress }));
}

/** `AllowEntry` allowlist marker — `["allow", acl_authority, account]`. */
export async function allowEntryPda(
  seeds: { aclAuthority: Address; account: Address },
  programAddress: Address = POOL_PROGRAM_ID,
): Promise<Address> {
  return addr(await findAllowEntryPda(seeds, { programAddress }));
}

/**
 * Position NFT mint — `["pos_mint", pool, position_index:u64-le]`. Hand-rolled (not in the IDL).
 * `index` is the pool's `position_index` at deposit time.
 */
export async function positionMintPda(
  pool: Address,
  index: bigint | number,
  programAddress: Address = POOL_PROGRAM_ID,
): Promise<Address> {
  const pda = await getProgramDerivedAddress({
    programAddress,
    seeds: [
      getUtf8Encoder().encode("pos_mint"),
      getAddressEncoder().encode(pool),
      getU64Encoder().encode(BigInt(index)),
    ],
  });
  return pda[0];
}

/**
 * `ProtectorEpoch` snapshot — `["protector_epoch", pool, epoch:u64-le]`. Hand-rolled (not in the IDL).
 */
export async function protectorEpochPda(
  pool: Address,
  epoch: bigint | number,
  programAddress: Address = POOL_PROGRAM_ID,
): Promise<Address> {
  const pda = await getProgramDerivedAddress({
    programAddress,
    seeds: [
      getUtf8Encoder().encode("protector_epoch"),
      getAddressEncoder().encode(pool),
      getU64Encoder().encode(BigInt(epoch)),
    ],
  });
  return pda[0];
}

// --- composite-oracle PDAs --------------------------------------------------

/** `OracleConfig` singleton — `["oracle_config"]`. */
export async function oracleConfigPda(programAddress: Address = ORACLE_PROGRAM_ID): Promise<Address> {
  return addr(await findOracleConfigPda({ programAddress }));
}

/** `FeedConfig` — `["feed", token_mint]`. */
export async function feedPda(tokenMint: Address, programAddress: Address = ORACLE_PROGRAM_ID): Promise<Address> {
  return addr(await findFeedPda({ tokenMint }, { programAddress }));
}
