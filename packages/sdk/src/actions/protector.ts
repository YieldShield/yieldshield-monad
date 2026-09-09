/**
 * Protector (backing) lifecycle: start/cancel the withdrawal notice, then withdraw (full/partial).
 *
 * Withdrawal is two steps: `startUnlock` begins the notice (`unlock_duration`, surfaced as the
 * "28-day notice period"), then after it elapses `withdrawProtector` releases collateral not
 * backing active savers. `cancelUnlock` aborts an in-progress notice.
 */
import type { Address, TransactionSigner } from "@solana/kit";
import { getStartUnlockInstruction } from "../generated/pool/instructions/startUnlock.js";
import { getCancelUnlockInstruction } from "../generated/pool/instructions/cancelUnlock.js";
import { getWithdrawProtectorInstruction } from "../generated/pool/instructions/withdrawProtector.js";
import { getPartialWithdrawProtectorInstruction } from "../generated/pool/instructions/partialWithdrawProtector.js";
import type { RpcLike } from "../accounts.js";
import { factoryPda, poolConfigPda, protectorPositionPda, vaultBackingPda } from "../pdas.js";
import { assetAccount, ata, TOKEN_PROGRAM } from "./common.js";

export type ProtectorNoticeParams = {
  owner: TransactionSigner;
  positionMint: Address;
};

export type WithdrawProtectorParams = {
  /** Needed to resolve the backing asset's token program (classic SPL or Token-2022). */
  rpc: RpcLike;
  owner: TransactionSigner;
  pool: Address;
  backingMint: Address;
  positionMint: Address;
  /** Slippage floor (base units). */
  minOut: bigint;
};

export type PartialWithdrawProtectorParams = WithdrawProtectorParams & {
  /** Amount of backing collateral to withdraw (base units). */
  amount: bigint;
};

/** Begin the protector withdrawal notice (`unlock_duration`). */
export async function startUnlock(params: ProtectorNoticeParams) {
  const { owner, positionMint } = params;
  return getStartUnlockInstruction({
    owner,
    positionMint,
    ownerPositionAccount: await ata(positionMint, owner.address),
    protectorPosition: await protectorPositionPda(positionMint),
    positionTokenProgram: TOKEN_PROGRAM,
  });
}

/** Abort an in-progress protector withdrawal notice. */
export async function cancelUnlock(params: ProtectorNoticeParams) {
  const { owner, positionMint } = params;
  return getCancelUnlockInstruction({
    owner,
    positionMint,
    ownerPositionAccount: await ata(positionMint, owner.address),
    protectorPosition: await protectorPositionPda(positionMint),
    positionTokenProgram: TOKEN_PROGRAM,
  });
}

/** Full protector withdraw after the notice has elapsed — closes the protector position. */
export async function withdrawProtector(params: WithdrawProtectorParams) {
  const { rpc, owner, pool, backingMint, positionMint, minOut } = params;
  const ownerAddr = owner.address;
  const { tokenProgram: assetTokenProgram, ownerAccount: ownerBackingAccount } = await assetAccount(
    rpc,
    backingMint,
    ownerAddr,
  );
  return getWithdrawProtectorInstruction({
    owner,
    factory: await factoryPda(),
    pool,
    poolConfig: await poolConfigPda(pool),
    backingMint,
    vaultBacking: await vaultBackingPda(pool),
    ownerBackingAccount,
    positionMint,
    ownerPositionAccount: await ata(positionMint, ownerAddr),
    protectorPosition: await protectorPositionPda(positionMint),
    assetTokenProgram,
    positionTokenProgram: TOKEN_PROGRAM,
    minOut,
  });
}

/** Partial protector withdraw — keeps the position open. Cannot exceed collateral not backing savers. */
export async function partialWithdrawProtector(params: PartialWithdrawProtectorParams) {
  const { rpc, owner, pool, backingMint, positionMint, amount, minOut } = params;
  const ownerAddr = owner.address;
  const { tokenProgram: assetTokenProgram, ownerAccount: ownerBackingAccount } = await assetAccount(
    rpc,
    backingMint,
    ownerAddr,
  );
  return getPartialWithdrawProtectorInstruction({
    owner,
    factory: await factoryPda(),
    pool,
    poolConfig: await poolConfigPda(pool),
    backingMint,
    vaultBacking: await vaultBackingPda(pool),
    ownerBackingAccount,
    positionMint,
    ownerPositionAccount: await ata(positionMint, ownerAddr),
    protectorPosition: await protectorPositionPda(positionMint),
    assetTokenProgram,
    positionTokenProgram: TOKEN_PROGRAM,
    amount,
    minOut,
  });
}
