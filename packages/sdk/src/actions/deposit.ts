/**
 * Deposit actions — saver (shield) and protector (backing).
 *
 * Both mint a brand-new position NFT whose mint PDA is keyed by the pool's CURRENT `positionIndex`,
 * so these fetch the pool to read that index (mirroring `e2e/smoke.cjs`). They return the built
 * instruction together with the derived `positionMint` so the UI can track the new position.
 */
import type { Address, TransactionSigner } from "@solana/kit";
import { getDepositBackingInstruction } from "../generated/pool/instructions/depositBacking.js";
import { getDepositShieldedInstruction } from "../generated/pool/instructions/depositShielded.js";
import { fetchPool, type RpcLike } from "../accounts.js";
import { ORACLE_PROGRAM_ID } from "../config.js";
import {
  factoryPda,
  feedPda,
  poolConfigPda,
  positionMintPda,
  protectorPositionPda,
  shieldPositionPda,
  vaultBackingPda,
  vaultShieldedPda,
} from "../pdas.js";
import { attachPriceAccounts } from "../oracle.js";
import { assetAccount, ASSOCIATED_TOKEN_PROGRAM, ata, NONE_ACCOUNT, SYSTEM_PROGRAM, TOKEN_PROGRAM } from "./common.js";

export type DepositShieldedParams = {
  rpc: RpcLike;
  owner: TransactionSigner;
  pool: Address;
  shieldedMint: Address;
  backingMint: Address;
  /** Amount of shielded asset to deposit (base units). */
  amount: bigint;
  /** Slippage floor (base units); use `minReceived(amount)` from the SDK. */
  minReceived: bigint;
  /** Required only when the pool has access control: the depositor's `AllowEntry` PDA. */
  allowEntry?: Address;
};

export type DepositBackingParams = {
  rpc: RpcLike;
  owner: TransactionSigner;
  pool: Address;
  backingMint: Address;
  amount: bigint;
  minReceived: bigint;
  allowEntry?: Address;
};

async function nextPositionMint(rpc: RpcLike, pool: Address): Promise<{ positionMint: Address; index: bigint }> {
  const { data } = await fetchPool(rpc, pool);
  const positionMint = await positionMintPda(pool, data.positionIndex);
  return { positionMint, index: data.positionIndex };
}

/** Saver deposit into the shield side. Returns the instruction + the new position NFT mint. */
export async function depositShielded(
  params: DepositShieldedParams,
): Promise<{ instruction: ReturnType<typeof getDepositShieldedInstruction>; positionMint: Address }> {
  const { rpc, owner, pool, shieldedMint, backingMint, amount, minReceived } = params;
  const ownerAddr = owner.address;
  const { positionMint } = await nextPositionMint(rpc, pool);
  // The shielded asset may be classic SPL or Token-2022 (e.g. PYUSD) — resolve its program + ATA.
  const { tokenProgram: assetTokenProgram, ownerAccount: ownerShieldedAccount } = await assetAccount(
    rpc,
    shieldedMint,
    ownerAddr,
  );

  // `deposit_shielded` reads BOTH the shielded (valuation) and backing (collateral sizing/coverage)
  // prices via the oracle CPI, so carry both feeds' external price accounts (Pyth → the price
  // account; Manual → nothing appended).
  const instruction = await attachPriceAccounts(
    rpc,
    getDepositShieldedInstruction({
      owner,
      factory: await factoryPda(),
      pool,
      poolConfig: await poolConfigPda(pool),
      shieldedMint,
      backingMint,
      ownerShieldedAccount,
      vaultShielded: await vaultShieldedPda(pool),
      positionMint,
      ownerPositionAccount: await ata(positionMint, ownerAddr),
      shieldPosition: await shieldPositionPda(positionMint),
      assetTokenProgram,
      positionTokenProgram: TOKEN_PROGRAM,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
      systemProgram: SYSTEM_PROGRAM,
      oracleProgram: ORACLE_PROGRAM_ID,
      shieldedFeed: await feedPda(shieldedMint),
      backingFeed: await feedPda(backingMint),
      allowEntry: params.allowEntry ?? NONE_ACCOUNT,
      amount,
      minReceived,
    }),
    [shieldedMint, backingMint],
  );
  return { instruction, positionMint };
}

/** Protector deposit into the backing side. Returns the instruction + the new position NFT mint. */
export async function depositBacking(
  params: DepositBackingParams,
): Promise<{ instruction: ReturnType<typeof getDepositBackingInstruction>; positionMint: Address }> {
  const { rpc, owner, pool, backingMint, amount, minReceived } = params;
  const ownerAddr = owner.address;
  const { positionMint } = await nextPositionMint(rpc, pool);
  const { tokenProgram: assetTokenProgram, ownerAccount: ownerBackingAccount } = await assetAccount(
    rpc,
    backingMint,
    ownerAddr,
  );

  const instruction = getDepositBackingInstruction({
    owner,
    factory: await factoryPda(),
    pool,
    poolConfig: await poolConfigPda(pool),
    backingMint,
    ownerBackingAccount,
    vaultBacking: await vaultBackingPda(pool),
    positionMint,
    ownerPositionAccount: await ata(positionMint, ownerAddr),
    protectorPosition: await protectorPositionPda(positionMint),
    assetTokenProgram,
    positionTokenProgram: TOKEN_PROGRAM,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
    systemProgram: SYSTEM_PROGRAM,
    allowEntry: params.allowEntry ?? NONE_ACCOUNT,
    amount,
    minReceived,
  });
  return { instruction, positionMint };
}
