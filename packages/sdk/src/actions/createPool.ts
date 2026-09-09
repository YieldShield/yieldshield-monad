/**
 * Create-pool action — assemble the `create_pool` instruction from a token pair + pool parameters.
 *
 * The split-risk-pool program does NOT create the token mints; the two mints must already be
 * whitelisted (`add_token`, so their `WhitelistEntry` PDAs exist) and their backing feed configured.
 * This builder derives every PDA the instruction needs, resolves each mint's token program from its
 * on-chain owner (classic SPL vs Token-2022), and returns the pool address it will create so the UI
 * can navigate to it. It also prepends an idempotent create-ATA for the creator's backing account —
 * `create_pool` reads it as the creation-bond source and it must exist even when the bond is 0.
 */
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { getCreateAssociatedTokenIdempotentInstructionAsync } from "@solana-program/token";
import { getCreatePoolInstructionAsync } from "../generated/pool/instructions/createPool.js";
import { ORACLE_PROGRAM_ID } from "../config.js";
import { feedPda, poolPda } from "../pdas.js";
import type { RpcLike } from "../accounts.js";
import { ata, resolveTokenProgram } from "./common.js";

export type CreatePoolParams = {
  rpc: RpcLike;
  /** Pool creator (signs, pays rent + any creation bond). */
  creator: TransactionSigner;
  /** Protected (shield-side) asset mint — must be whitelisted. */
  shieldedMint: Address;
  /** Backing (protector-side) asset mint — must be whitelisted, with a configured feed. */
  backingMint: Address;

  // --- pool parameters (basis points where noted; base units / seconds otherwise) ---
  /** Minimum collateral ratio, bp. Must be ≥ the whitelist floor of both legs (100% = 10_000). */
  collateralRatioBp: bigint | number;
  /** Protector commission on shield yield, bp. */
  commissionRateBp: bigint | number;
  /** Pool fee, bp. */
  poolFeeBp: bigint | number;
  /** Protocol fee, bp. */
  protocolFeeBp: bigint | number;
  /** Max pool TVL, USD with 8 decimals (u128). */
  maxTvlUsd: bigint | number;
  /** Minimum pool lifetime before it can be wound down, seconds. */
  minimumPoolTime: bigint | number;
  /** Protector unlock notice period, seconds. */
  unlockDuration: bigint | number;
  /** Shield-side transfer lock, seconds. */
  shieldTransferLock: bigint | number;
  /** Protector-side transfer lock, seconds. */
  protectorTransferLock: bigint | number;

  // --- optional (sensible defaults) ---
  shieldedMinDeposit?: bigint | number;
  shieldedMaxDeposit?: bigint | number;
  backingMinDeposit?: bigint | number;
  backingMaxDeposit?: bigint | number;
  /** Creation bond in backing-token base units (default 0). */
  creationBondAmount?: bigint | number;
  /** Fee recipients (default: the creator). */
  protocolFeeRecipient?: Address;
  poolFeeRecipient?: Address;
  /** Access-control authority; `null`/omitted = open pool. */
  accessControl?: Address | null;
};

/**
 * Build the transaction instructions to create a pool from `shieldedMint` × `backingMint`. Returns
 * the instructions (idempotent backing-ATA create, then `create_pool`) and the derived pool address.
 */
export async function createPool(params: CreatePoolParams): Promise<{ instructions: Instruction[]; pool: Address }> {
  const { rpc, creator, shieldedMint, backingMint } = params;
  const creatorAddr = creator.address;

  const [shieldedTokenProgram, backingTokenProgram] = await Promise.all([
    resolveTokenProgram(rpc, shieldedMint),
    resolveTokenProgram(rpc, backingMint),
  ]);

  const pool = await poolPda({ shieldedMint, backingMint, creator: creatorAddr });
  const creatorBackingAccount = await ata(backingMint, creatorAddr, backingTokenProgram);

  const ensureBackingAta = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer: creator,
    owner: creatorAddr,
    mint: backingMint,
    tokenProgram: backingTokenProgram,
  });

  const createIx = await getCreatePoolInstructionAsync({
    creator,
    shieldedMint,
    backingMint,
    pool,
    creatorBackingAccount,
    shieldedTokenProgram,
    backingTokenProgram,
    oracleProgram: ORACLE_PROGRAM_ID,
    backingFeed: await feedPda(backingMint),
    commissionRateBp: BigInt(params.commissionRateBp),
    poolFeeBp: BigInt(params.poolFeeBp),
    collateralRatioBp: BigInt(params.collateralRatioBp),
    shieldedMinDeposit: BigInt(params.shieldedMinDeposit ?? 0),
    shieldedMaxDeposit: BigInt(params.shieldedMaxDeposit ?? 0),
    backingMinDeposit: BigInt(params.backingMinDeposit ?? 0),
    backingMaxDeposit: BigInt(params.backingMaxDeposit ?? 0),
    maxTvlUsd: BigInt(params.maxTvlUsd),
    minimumPoolTime: BigInt(params.minimumPoolTime),
    unlockDuration: BigInt(params.unlockDuration),
    protocolFeeBp: BigInt(params.protocolFeeBp),
    protocolFeeRecipient: params.protocolFeeRecipient ?? creatorAddr,
    poolFeeRecipient: params.poolFeeRecipient ?? creatorAddr,
    shieldTransferLock: BigInt(params.shieldTransferLock),
    protectorTransferLock: BigInt(params.protectorTransferLock),
    creationBondAmount: BigInt(params.creationBondAmount ?? 0),
    accessControl: params.accessControl ?? null,
  });

  return { instructions: [ensureBackingAta, createIx], pool };
}
