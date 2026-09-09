/**
 * Collect (earnings) — the user-facing "Collect" maps to two on-chain claims:
 *   - `claimCommission` — protector premium income (allowed even when the pool is paused).
 *   - `claimRewards`    — shield-side MasterChef rewards for a saver position.
 */
import type { Address, TransactionSigner } from "@solana/kit";
import { getClaimCommissionInstruction } from "../generated/pool/instructions/claimCommission.js";
import { getClaimRewardsInstruction } from "../generated/pool/instructions/claimRewards.js";
import type { RpcLike } from "../accounts.js";
import { ORACLE_PROGRAM_ID } from "../config.js";
import { attachPriceAccounts } from "../oracle.js";
import { feedPda, poolConfigPda, protectorPositionPda, shieldPositionPda, vaultShieldedPda } from "../pdas.js";
import { assetAccount, ata, NONE_ACCOUNT, TOKEN_PROGRAM } from "./common.js";

export type ClaimCommissionParams = {
  /** Needed to resolve the shielded asset's token program (classic SPL or Token-2022). */
  rpc: RpcLike;
  owner: TransactionSigner;
  pool: Address;
  shieldedMint: Address;
  positionMint: Address;
  /** Expired-epoch claims pass the `ProtectorEpoch` PDA; current-epoch claims omit it (None sentinel). */
  protectorEpoch?: Address;
};

export type ClaimRewardsParams = {
  /** Needed to resolve the shielded feed's external price account (Pyth) for the oracle CPI. */
  rpc: RpcLike;
  owner: TransactionSigner;
  pool: Address;
  shieldedMint: Address;
  positionMint: Address;
};

/** Claim protector premium (commission). Allowed even when the pool is paused. */
export async function claimCommission(params: ClaimCommissionParams) {
  const { rpc, owner, pool, shieldedMint, positionMint } = params;
  const ownerAddr = owner.address;
  const { tokenProgram: assetTokenProgram, ownerAccount: ownerShieldedAccount } = await assetAccount(
    rpc,
    shieldedMint,
    ownerAddr,
  );
  return getClaimCommissionInstruction({
    owner,
    pool,
    shieldedMint,
    vaultShielded: await vaultShieldedPda(pool),
    positionMint,
    ownerPositionAccount: await ata(positionMint, ownerAddr),
    protectorPosition: await protectorPositionPda(positionMint),
    ownerShieldedAccount,
    protectorEpoch: params.protectorEpoch ?? NONE_ACCOUNT,
    assetTokenProgram,
    positionTokenProgram: TOKEN_PROGRAM,
  });
}

/** Claim shield-side rewards for a saver position. */
export async function claimRewards(params: ClaimRewardsParams) {
  const { rpc, owner, pool, shieldedMint, positionMint } = params;
  return attachPriceAccounts(
    rpc,
    getClaimRewardsInstruction({
      owner,
      pool,
      poolConfig: await poolConfigPda(pool),
      shieldedMint,
      positionMint,
      ownerPositionAccount: await ata(positionMint, owner.address),
      shieldPosition: await shieldPositionPda(positionMint),
      positionTokenProgram: TOKEN_PROGRAM,
      oracleProgram: ORACLE_PROGRAM_ID,
      shieldedFeed: await feedPda(shieldedMint),
    }),
    [shieldedMint],
  );
}
