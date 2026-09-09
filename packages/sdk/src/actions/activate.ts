/**
 * Activate protection — the saver's cross-asset exit into the backing/safe asset, drawing on
 * protector collateral. On-chain this is gated by `minimum_pool_time`; the UI must only enable it
 * after the position's protected-exit unlock date (see read models).
 */
import type { Address, TransactionSigner } from "@solana/kit";
import { getActivateShieldedInstruction } from "../generated/pool/instructions/activateShielded.js";
import type { RpcLike } from "../accounts.js";
import { ORACLE_PROGRAM_ID } from "../config.js";
import { attachPriceAccounts } from "../oracle.js";
import { factoryPda, feedPda, poolConfigPda, shieldPositionPda, vaultBackingPda } from "../pdas.js";
import { assetAccount, ata, TOKEN_PROGRAM } from "./common.js";

export type ActivateShieldedParams = {
  /** Needed to resolve the shielded + backing feeds' external price accounts (Pyth) for the CPI. */
  rpc: RpcLike;
  owner: TransactionSigner;
  pool: Address;
  shieldedMint: Address;
  backingMint: Address;
  positionMint: Address;
  /** Minimum backing-asset out (base units); default 0.995x via `minReceived`. */
  minOut: bigint;
};

/** Convert a protected savings position into the backing/safe asset (cross-asset withdraw). */
export async function activateShielded(params: ActivateShieldedParams) {
  const { rpc, owner, pool, shieldedMint, backingMint, positionMint, minOut } = params;
  const ownerAddr = owner.address;
  // The paid-out asset is the backing token — resolve its program + ATA (classic SPL or Token-2022).
  const { tokenProgram: assetTokenProgram, ownerAccount: ownerBackingAccount } = await assetAccount(
    rpc,
    backingMint,
    ownerAddr,
  );
  // Reads both the shielded price (position value) and the backing price (amount to pay out).
  return attachPriceAccounts(
    rpc,
    getActivateShieldedInstruction({
      owner,
      factory: await factoryPda(),
      pool,
      poolConfig: await poolConfigPda(pool),
      shieldedMint,
      backingMint,
      vaultBacking: await vaultBackingPda(pool),
      ownerBackingAccount,
      positionMint,
      ownerPositionAccount: await ata(positionMint, ownerAddr),
      shieldPosition: await shieldPositionPda(positionMint),
      assetTokenProgram,
      positionTokenProgram: TOKEN_PROGRAM,
      oracleProgram: ORACLE_PROGRAM_ID,
      shieldedFeed: await feedPda(shieldedMint),
      backingFeed: await feedPda(backingMint),
      minOut,
    }),
    [shieldedMint, backingMint],
  );
}
