/**
 * Accrue fees — permissionless crank that crystallizes a shield position's price-driven premium
 * into the pool's fee reserves (and skims it in-kind from the position). Settling a position before
 * reading its withdrawable keeps the displayed amount exact.
 */
import type { Address, TransactionSigner } from "@solana/kit";
import { getAccrueFeesInstruction } from "../generated/pool/instructions/accrueFees.js";
import type { RpcLike } from "../accounts.js";
import { ORACLE_PROGRAM_ID } from "../config.js";
import { attachPriceAccounts } from "../oracle.js";
import { feedPda, poolConfigPda, shieldPositionPda } from "../pdas.js";

export type AccrueFeesParams = {
  /** Needed to resolve the shielded feed's external price account (Pyth) for the oracle CPI. */
  rpc: RpcLike;
  /** Anyone can crank; pays the fee. */
  cranker: TransactionSigner;
  pool: Address;
  shieldedMint: Address;
  /** The shield position to crystallize. */
  positionMint: Address;
};

/** Crystallize a shield position's accrued premium into the pool fee reserves. */
export async function accrueFees(params: AccrueFeesParams) {
  const { rpc, cranker, pool, shieldedMint, positionMint } = params;
  return attachPriceAccounts(
    rpc,
    getAccrueFeesInstruction({
      cranker,
      pool,
      poolConfig: await poolConfigPda(pool),
      shieldedMint,
      positionMint,
      shieldPosition: await shieldPositionPda(positionMint),
      oracleProgram: ORACLE_PROGRAM_ID,
      shieldedFeed: await feedPda(shieldedMint),
    }),
    [shieldedMint],
  );
}
