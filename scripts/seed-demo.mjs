/**
 * Seed the local surfnet with demo pools so the app has live data to render.
 *
 * Creates two pools whose shielded-token whitelist symbols match the design presets (USDC, JITOSOL),
 * each with protector backing + a saver deposit so coverage/utilization/capacity are non-trivial.
 * The app discovers these via getProgramAccounts and maps display copy by symbol.
 *
 * Usage (surfnet must be running with both programs deployed):
 *   node app/scripts/seed-demo.mjs
 *
 * It is idempotent-ish: re-running creates fresh mints → fresh pools (pools are keyed by mints).
 * This is a DEV tool — it is not part of the app bundle.
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
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  none,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMintInstruction,
  getMintSize,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  bondVaultPda,
  depositBacking,
  depositShielded,
  factoryPda,
  feedPda,
  ORACLE_PROGRAM_ID,
  oracleClient,
  oracleConfigPda,
  poolClient,
  poolConfigPda,
  poolPda,
  tokenEntryPda,
  vaultBackingPda,
  vaultShieldedPda,
} from "@yieldshield/sdk";

const { getConfigureFeedInstruction, getInitOracleConfigInstruction, getPushManualPriceInstruction, FeedKind } =
  oracleClient;
const { getAddTokenInstruction, getCreatePoolInstruction, getInitFactoryInstruction, getSetMaxActivePoolsInstruction } =
  poolClient;

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const WALLET = process.env.ANCHOR_WALLET ?? join(homedir(), ".config/solana/id.json");
const DEC = 6;
const ONE = 1_000_000n;
const USD_ONE = 100_000_000n;
const ONE_DAY = 86_400n;
const SYSVAR_CLOCK = address("SysvarC1ock11111111111111111111111111111111");

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

async function chainNow() {
  const { value } = await rpc.getAccountInfo(SYSVAR_CLOCK, { encoding: "base64", commitment: "confirmed" }).send();
  return Buffer.from(value.data[0], "base64").readBigInt64LE(32);
}

async function createMint(gov) {
  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());
  const lamports = await rpc.getMinimumBalanceForRentExemption(space).send();
  await send(gov, [
    getCreateAccountInstruction({
      payer: gov,
      newAccount: mint,
      lamports,
      space,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMintInstruction({
      mint: mint.address,
      decimals: DEC,
      mintAuthority: gov.address,
      freezeAuthority: null,
    }),
  ]);
  return mint.address;
}

async function ataFor(owner, mint) {
  const [a] = await findAssociatedTokenPda({ owner, tokenProgram: TOKEN_PROGRAM_ADDRESS, mint });
  return a;
}

async function fundAta(gov, owner, mint, amount) {
  const ata = await ataFor(owner, mint);
  const ix = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: gov, owner, mint });
  const ixs = [ix];
  if (amount > 0n) ixs.push(getMintToInstruction({ mint, token: ata, mintAuthority: gov, amount }));
  await send(gov, ixs);
  return ata;
}

async function airdrop(addr, sol) {
  const sig = await rpc.requestAirdrop(addr, BigInt(sol) * 1_000_000_000n, { commitment: "confirmed" }).send();
  await confirm(sig);
}

/** Run `fn` only if the singleton PDA doesn't already exist (init-once instructions). */
const initIfAbsent = async (pda, label, fn) => {
  const { value } = await rpc.getAccountInfo(pda, { commitment: "confirmed" }).send();
  if (value) {
    console.log(`  (${label} exists, skipping)`);
    return;
  }
  await fn();
};

async function configureManualFeed(gov, mint, priceUsd8) {
  const oracleConfig = await oracleConfigPda();
  const feed = await feedPda(mint);
  await send(gov, [
    getConfigureFeedInstruction({
      governanceAuthority: gov,
      oracleConfig,
      feed,
      tokenMint: mint,
      primary: { kind: FeedKind.Manual, account: gov.address },
      backup: none(),
      requiresStrict: false,
      maxPriceAge: 1_000_000_000n,
      maxConfidenceBps: 200n,
      maxDeviationBps: 500n,
    }),
  ]);
  await send(gov, [
    getPushManualPriceInstruction({
      governanceAuthority: gov,
      oracleConfig,
      feed,
      tokenMint: mint,
      isBackup: false,
      price: priceUsd8,
      publishTime: await chainNow(),
    }),
  ]);
}

async function addToken(gov, mint, symbol) {
  await send(gov, [
    getAddTokenInstruction({
      governanceAuthority: gov,
      factory: await factoryPda(),
      mint,
      tokenEntry: await tokenEntryPda(mint),
      params: {
        name: symbol,
        symbol,
        primaryFeed: gov.address,
        backupFeed: none(),
        minCollateralRatioBp: 10_000n,
        requiresStrictProtectedPrice: false,
      },
    }),
  ]);
}

async function seedPool(gov, { symbol, shieldedPrice, maxTvlUsd, backing, shield }) {
  const shielded = await createMint(gov);
  const backingMint = await createMint(gov);
  await configureManualFeed(gov, shielded, shieldedPrice);
  await configureManualFeed(gov, backingMint, USD_ONE);
  await addToken(gov, shielded, symbol);
  await addToken(gov, backingMint, "USDC");

  const pool = await poolPda({ shieldedMint: shielded, backingMint, creator: gov.address });
  const creatorBacking = await fundAta(gov, gov.address, backingMint, 0n);
  await send(gov, [
    getCreatePoolInstruction({
      creator: gov,
      factory: await factoryPda(),
      shieldedMint: shielded,
      backingMint,
      shieldedTokenEntry: await tokenEntryPda(shielded),
      backingTokenEntry: await tokenEntryPda(backingMint),
      pool,
      poolConfig: await poolConfigPda(pool),
      vaultShielded: await vaultShieldedPda(pool),
      vaultBacking: await vaultBackingPda(pool),
      bondVault: await bondVaultPda(pool),
      creatorBackingAccount: creatorBacking,
      shieldedTokenProgram: TOKEN_PROGRAM_ADDRESS,
      backingTokenProgram: TOKEN_PROGRAM_ADDRESS,
      oracleProgram: ORACLE_PROGRAM_ID,
      backingFeed: await feedPda(backingMint),
      commissionRateBp: 1000n,
      poolFeeBp: 500n,
      collateralRatioBp: 10_000n,
      shieldedMinDeposit: 0n,
      shieldedMaxDeposit: 0n,
      backingMinDeposit: 0n,
      backingMaxDeposit: 0n,
      maxTvlUsd,
      minimumPoolTime: ONE_DAY,
      unlockDuration: ONE_DAY * 28n,
      protocolFeeBp: 100n,
      protocolFeeRecipient: gov.address,
      poolFeeRecipient: gov.address,
      shieldTransferLock: 3600n,
      protectorTransferLock: 0n,
      creationBondAmount: 0n,
      accessControl: null,
    }),
  ]);

  // Protector backing (so coverage > 0) then a saver deposit (so utilization shows).
  const bob = await generateKeyPairSigner();
  await airdrop(bob.address, 2);
  await fundAta(gov, bob.address, backingMint, backing);
  const backed = await depositBacking({ rpc, owner: bob, pool, backingMint, amount: backing, minReceived: 0n });
  await send(bob, [backed.instruction]);

  if (shield > 0n) {
    const alice = await generateKeyPairSigner();
    await airdrop(alice.address, 2);
    await fundAta(gov, alice.address, shielded, shield);
    const dep = await depositShielded({
      rpc,
      owner: alice,
      pool,
      shieldedMint: shielded,
      backingMint,
      amount: shield,
      minReceived: 0n,
    });
    await send(alice, [dep.instruction]);
  }

  console.log(`  ✓ ${symbol} pool ${pool}  (backing ${backing / ONE}, shield ${shield / ONE})`);
  return pool;
}

const gov = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(WALLET, "utf8"))));
console.log(`Seeding demo pools as ${gov.address} on ${RPC_URL}`);
await initIfAbsent(await oracleConfigPda(), "oracle config", async () =>
  send(gov, [
    getInitOracleConfigInstruction({
      payer: gov,
      oracleConfig: await oracleConfigPda(),
      governanceAuthority: gov.address,
    }),
  ]),
);
await initIfAbsent(await factoryPda(), "factory", async () =>
  send(gov, [
    getInitFactoryInstruction({
      payer: gov,
      factory: await factoryPda(),
      governanceAuthority: gov.address,
      defaultOracle: ORACLE_PROGRAM_ID,
      minimumCreationBondUsd: 0n,
      maxActivePools: 50,
    }),
  ]),
);

// Ensure the factory can hold more pools (prior runs may have filled the cap).
{
  const f = await import("@yieldshield/sdk");
  const factory = await f.fetchFactory(rpc, await factoryPda());
  if (factory.data.maxActivePools < factory.data.activePoolCount + 2) {
    await send(gov, [
      getSetMaxActivePoolsInstruction({
        governanceAuthority: gov,
        factory: await factoryPda(),
        value: factory.data.activePoolCount + 10,
      }),
    ]);
    console.log(`  raised maxActivePools to ${factory.data.activePoolCount + 10}`);
  }
}

await seedPool(gov, {
  symbol: "USDC",
  shieldedPrice: USD_ONE,
  maxTvlUsd: 10_000_000n * USD_ONE,
  backing: 6400n * ONE,
  shield: 1800n * ONE,
});
// jitoSOL @ $180: 40 shielded ≈ $7,200 required collateral, so back it with 9,000 USDC.
await seedPool(gov, {
  symbol: "JITOSOL",
  shieldedPrice: 180n * USD_ONE,
  maxTvlUsd: 5_000_000n * USD_ONE,
  backing: 9000n * ONE,
  shield: 40n * ONE,
});
console.log("Done. Reload the app to see the pools.");
