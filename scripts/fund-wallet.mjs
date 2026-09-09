/**
 * Fund a wallet (e.g. your Phantom address) on the local surfnet so it can use the demo pools:
 * airdrops SOL and mints each demo pool's shielded + backing tokens to the address (the seed's gov
 * keypair is still the mint authority).
 *
 * Usage:  npx tsx app/scripts/fund-wallet.mjs <YOUR_WALLET_ADDRESS>
 *
 * After this: in Phantom add a custom network for http://127.0.0.1:8899, switch to it, connect, and
 * you'll have SOL + tokens to deposit / provide protection. Keep deposits small (e.g. 50–100) so the
 * pool's protector coverage can cover them.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getWhitelistEntry, listAllPoolStats } from "@yieldshield/sdk";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const WALLET = process.env.ANCHOR_WALLET ?? join(homedir(), ".config/solana/id.json");
const ONE = 1_000_000n;

const target = process.argv[2];
if (!target) {
  console.error("Usage: npx tsx app/scripts/fund-wallet.mjs <WALLET_ADDRESS>");
  process.exit(1);
}
const owner = address(target);
const rpc = createSolanaRpc(RPC_URL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function confirm(sig) {
  for (let i = 0; i < 60; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const s = value[0];
    if (s) {
      if (s.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(s.err)}`);
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") return;
    }
    await sleep(400);
  }
  throw new Error(`tx ${sig} not confirmed`);
}

async function send(payer, instructions) {
  const { value: bh } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  const sig = getSignatureFromTransaction(signed);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: "base64", preflightCommitment: "confirmed" })
    .send();
  await confirm(sig);
  return sig;
}

const gov = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(WALLET, "utf8"))));
console.log(`Funding ${owner} on ${RPC_URL} (mint authority ${gov.address})`);

// 1. SOL for fees
const air = await rpc.requestAirdrop(owner, 2n * 1_000_000_000n, { commitment: "confirmed" }).send();
await confirm(air);
console.log("  airdropped 2 SOL");

// 2. Mint each demo pool's shielded + backing token to the wallet
const stats = await listAllPoolStats(rpc);
const minted = new Set();
for (const s of stats) {
  const sh = await getWhitelistEntry(rpc, s.pool.shieldedMint);
  if (!sh || (sh.data.symbol !== "USDC" && sh.data.symbol !== "JITOSOL")) continue;
  for (const [mint, amount, label] of [
    [s.pool.shieldedMint, 500n * ONE, `${sh.data.symbol} (shielded)`],
    [s.pool.backingMint, 20_000n * ONE, "USDC (backing)"],
  ]) {
    if (minted.has(mint)) continue;
    minted.add(mint);
    const [ata] = await findAssociatedTokenPda({ owner, tokenProgram: TOKEN_PROGRAM_ADDRESS, mint });
    const create = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: gov, owner, mint });
    await send(gov, [create, getMintToInstruction({ mint, token: ata, mintAuthority: gov, amount })]);
    console.log(`  minted ${amount / ONE} ${label}  (mint ${mint})`);
  }
}
console.log("Done. Connect this wallet in Phantom (custom RPC http://127.0.0.1:8899) and try a small deposit.");
