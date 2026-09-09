/**
 * Saver (shield) withdraw actions — same-asset exit, full or partial.
 *
 * Cross-asset exit into the backing/safe asset is `activateShielded` (see activate.ts).
 * Caller identifies the position by its NFT `positionMint`.
 */
import type { Address, TransactionSigner } from "@solana/kit";
import { getWithdrawShieldedInstruction } from "../generated/pool/instructions/withdrawShielded.js";
import { getPartialWithdrawShieldedInstruction } from "../generated/pool/instructions/partialWithdrawShielded.js";
import type { RpcLike } from "../accounts.js";
import { ORACLE_PROGRAM_ID } from "../config.js";
import { attachPriceAccounts } from "../oracle.js";
import { factoryPda, feedPda, poolConfigPda, shieldPositionPda, vaultShieldedPda } from "../pdas.js";
import { assetAccount, ata, TOKEN_PROGRAM } from "./common.js";

export type WithdrawShieldedParams = {
  /** Needed to resolve the shielded feed's external price account (Pyth) for the oracle CPI. */
  rpc: RpcLike;
  owner: TransactionSigner;
  pool: Address;
  shieldedMint: Address;
  positionMint: Address;
  /** Slippage floor (base units). */
  minOut: bigint;
};

export type PartialWithdrawShieldedParams = WithdrawShieldedParams & {
  /** Amount of shielded asset to withdraw (base units). Preserves the remainder's deposit time. */
  amount: bigint;
};

/** Full same-asset withdraw — closes the shield position. */
export async function withdrawShielded(params: WithdrawShieldedParams) {
  const { rpc, owner, pool, shieldedMint, positionMint, minOut } = params;
  const ownerAddr = owner.address;
  const { tokenProgram: assetTokenProgram, ownerAccount: ownerShieldedAccount } = await assetAccount(
    rpc,
    shieldedMint,
    ownerAddr,
  );
  return attachPriceAccounts(
    rpc,
    getWithdrawShieldedInstruction({
      owner,
      factory: await factoryPda(),
      pool,
      poolConfig: await poolConfigPda(pool),
      shieldedMint,
      vaultShielded: await vaultShieldedPda(pool),
      ownerShieldedAccount,
      positionMint,
      ownerPositionAccount: await ata(positionMint, ownerAddr),
      shieldPosition: await shieldPositionPda(positionMint),
      assetTokenProgram,
      positionTokenProgram: TOKEN_PROGRAM,
      oracleProgram: ORACLE_PROGRAM_ID,
      shieldedFeed: await feedPda(shieldedMint),
      minOut,
    }),
    [shieldedMint],
  );
}

/** Partial same-asset withdraw — keeps the position open; remainder retains its original deposit time. */
export async function partialWithdrawShielded(params: PartialWithdrawShieldedParams) {
  const { rpc, owner, pool, shieldedMint, positionMint, amount, minOut } = params;
  const ownerAddr = owner.address;
  const { tokenProgram: assetTokenProgram, ownerAccount: ownerShieldedAccount } = await assetAccount(
    rpc,
    shieldedMint,
    ownerAddr,
  );
  return attachPriceAccounts(
    rpc,
    getPartialWithdrawShieldedInstruction({
      owner,
      factory: await factoryPda(),
      pool,
      poolConfig: await poolConfigPda(pool),
      shieldedMint,
      vaultShielded: await vaultShieldedPda(pool),
      ownerShieldedAccount,
      positionMint,
      ownerPositionAccount: await ata(positionMint, ownerAddr),
      shieldPosition: await shieldPositionPda(positionMint),
      assetTokenProgram,
      positionTokenProgram: TOKEN_PROGRAM,
      oracleProgram: ORACLE_PROGRAM_ID,
      shieldedFeed: await feedPda(shieldedMint),
      amount,
      minOut,
    }),
    [shieldedMint],
  );
}
