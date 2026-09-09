/**
 * On-chain discovery — enumerate pools via `getProgramAccounts`, filtered by the `Pool` account
 * discriminator. Kept in the SDK so the app never talks to chain directly.
 */
import {
  getBase58Decoder,
  getBase64Encoder,
  type Address,
  type Base58EncodedBytes,
  type GetProgramAccountsApi,
  type GetTokenAccountsByOwnerApi,
  type Rpc,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { POOL_PROGRAM_ID } from "./config.js";
import { getPoolDecoder, getPoolDiscriminatorBytes, type Pool } from "./generated/pool/accounts/pool.js";
import {
  getWhitelistEntryDecoder,
  getWhitelistEntryDiscriminatorBytes,
  type WhitelistEntry,
} from "./generated/pool/accounts/whitelistEntry.js";

/** RPC capable of `getProgramAccounts` (a kit RPC client satisfies this). */
export type ProgramAccountsRpc = Rpc<GetProgramAccountsApi>;

/** RPC capable of `getTokenAccountsByOwner` (a kit RPC client satisfies this). */
export type TokenAccountsRpc = Rpc<GetTokenAccountsByOwnerApi>;

type ParsedTokenAccount = {
  account: { data: { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } } } };
};

/**
 * Mints of the position NFTs an owner holds (supply-1, 0-decimal tokens). Each maps to a shield or
 * protector position PDA; resolve with `getShieldPositionState` / `getProtectorPositionState`.
 */
export async function listPositionMintsHeld(
  rpc: TokenAccountsRpc,
  owner: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<Address[]> {
  const { value } = await rpc
    .getTokenAccountsByOwner(owner, { programId: tokenProgram }, { encoding: "jsonParsed" })
    .send();
  const mints: Address[] = [];
  for (const acc of value as unknown as ParsedTokenAccount[]) {
    const info = acc.account.data.parsed?.info;
    const amount = info?.tokenAmount;
    if (info?.mint && amount?.decimals === 0 && amount.amount === "1") {
      mints.push(info.mint as Address);
    }
  }
  return mints;
}

/** Fetch + decode every `Pool` owned by the split-risk-pool program. */
export async function listAllPools(
  rpc: ProgramAccountsRpc,
  programAddress: Address = POOL_PROGRAM_ID,
): Promise<Array<{ address: Address; data: Pool }>> {
  const discriminator = getBase58Decoder().decode(getPoolDiscriminatorBytes()) as Base58EncodedBytes;
  const accounts = await rpc
    .getProgramAccounts(programAddress, {
      encoding: "base64",
      filters: [{ memcmp: { offset: 0n, bytes: discriminator, encoding: "base58" } }],
    })
    .send();
  const decoder = getPoolDecoder();
  const base64 = getBase64Encoder();
  return accounts.map((a) => ({
    address: a.pubkey,
    data: decoder.decode(base64.encode(a.account.data[0])),
  }));
}

/**
 * Fetch + decode every whitelisted token (`WhitelistEntry`) the factory has registered. This is the
 * on-chain "selectable token list" — the seed set the faucet/seed scripts populated via `add_token`.
 * The Create-Pool UI picks token pairs from exactly these.
 */
export async function listWhitelistedTokens(
  rpc: ProgramAccountsRpc,
  programAddress: Address = POOL_PROGRAM_ID,
): Promise<Array<{ address: Address; data: WhitelistEntry }>> {
  const discriminator = getBase58Decoder().decode(getWhitelistEntryDiscriminatorBytes()) as Base58EncodedBytes;
  const accounts = await rpc
    .getProgramAccounts(programAddress, {
      encoding: "base64",
      filters: [{ memcmp: { offset: 0n, bytes: discriminator, encoding: "base58" } }],
    })
    .send();
  const decoder = getWhitelistEntryDecoder();
  const base64 = getBase64Encoder();
  return accounts.map((a) => ({
    address: a.pubkey,
    data: decoder.decode(base64.encode(a.account.data[0])),
  }));
}
