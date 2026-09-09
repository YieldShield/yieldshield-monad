/**
 * Shared helpers for the action builders.
 *
 * Actions return UNSIGNED instructions (kit `Instruction`s). The `owner` is a kit
 * `TransactionSigner` — the builder records it as a signer meta but does NOT sign; signing happens
 * when the app/Node assembles and signs the transaction. For a purely unsigned instruction (e.g.
 * simulation) pass a `createNoopSigner(address)`.
 *
 * The position NFT mint is ALWAYS classic SPL Token (the pool program mints it), so
 * `positionTokenProgram` stays {@link TOKEN_PROGRAM}. The ASSET mint, however, may be classic SPL or
 * Token-2022 (e.g. PYUSD) — actions resolve its program from the mint's on-chain owner via
 * {@link resolveTokenProgram} / {@link assetAccount} and pass it as `assetTokenProgram`. The
 * `Option<Account>` "None" sentinel is the program id passed as the account meta.
 */
import { address, type Address, type TransactionSigner } from "@solana/kit";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import type { RpcLike } from "../accounts.js";
import { POOL_PROGRAM_ID } from "../config.js";

/** Classic SPL Token program — used for asset mints AND position NFT mints (per smoke.cjs). */
export const TOKEN_PROGRAM: Address = TOKEN_PROGRAM_ADDRESS;
/** Token-2022 program (fixed, well-known address). Some seed tokens (e.g. PYUSD) live here. */
export const TOKEN_2022_PROGRAM: Address = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ASSOCIATED_TOKEN_PROGRAM: Address = ASSOCIATED_TOKEN_PROGRAM_ADDRESS;
export const SYSTEM_PROGRAM: Address = SYSTEM_PROGRAM_ADDRESS;

/**
 * "None" sentinel for an `Option<Account>` on the pool program: the program id passed as the
 * account meta (used for `allowEntry` when access control is off, and `protectorEpoch` on claim).
 */
export const NONE_ACCOUNT: Address = POOL_PROGRAM_ID;

/** Owner-supplied params common to every action. */
export type Owner = { owner: TransactionSigner };

/** Derive an associated token account address (classic SPL Token by default). */
export async function ata(mint: Address, owner: Address, tokenProgram: Address = TOKEN_PROGRAM): Promise<Address> {
  const [a] = await findAssociatedTokenPda({ owner, tokenProgram, mint });
  return a;
}

/** Resolve a mint's token program from its on-chain account owner (classic SPL or Token-2022). */
export async function resolveTokenProgram(rpc: RpcLike, mint: Address): Promise<Address> {
  const { value } = await rpc.getAccountInfo(mint, { encoding: "base64", commitment: "confirmed" }).send();
  if (!value) throw new Error(`mint ${mint} not found on chain`);
  return (value.owner as Address) === TOKEN_2022_PROGRAM ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM;
}

/**
 * Resolve an asset mint's token program AND the owner's associated token account under it — the two
 * values every asset transfer needs to be correct for both classic SPL and Token-2022 mints.
 */
export async function assetAccount(
  rpc: RpcLike,
  mint: Address,
  owner: Address,
): Promise<{ tokenProgram: Address; ownerAccount: Address }> {
  const tokenProgram = await resolveTokenProgram(rpc, mint);
  return { tokenProgram, ownerAccount: await ata(mint, owner, tokenProgram) };
}
