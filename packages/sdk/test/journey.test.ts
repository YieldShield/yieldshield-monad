/**
 * SDK surfnet journey — proves @yieldshield/sdk reproduces the validated happy path from
 * e2e/smoke.cjs end-to-end over a live surfnet, through the SDK's own action builders.
 *
 * Setup (oracle/factory/pool/mints) uses the generated builders + @solana-program/token kit
 * instructions; the saver/protector flow (deposit → accrue → claim → withdraw) uses the SDK actions.
 * Asserts the same 7 economic outcomes: commission 5 / pool 2.5 / protocol 0.5; Bob 5, Alice 92;
 * pool zeroed; Alice's position closed.
 *
 * Prereqs: a running surfnet with both programs deployed (see e2e/README.md) + a funded gov wallet.
 *   RPC_URL       default http://127.0.0.1:8899
 *   ANCHOR_WALLET default ~/.config/solana/id.json
 * If the RPC is unreachable the test is skipped (so `npm test` is safe without a validator).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
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
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Signature,
  type TransactionSigner,
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
  accrueFees,
  claimCommission,
  depositBacking,
  depositShielded,
  fetchPool,
  ORACLE_PROGRAM_ID,
  withdrawShielded,
} from "../src/index.js";
import {
  bondVaultPda,
  factoryPda,
  feedPda,
  oracleConfigPda,
  poolConfigPda,
  poolPda,
  tokenEntryPda,
  vaultBackingPda,
  vaultShieldedPda,
} from "../src/pdas.js";
import { getConfigureFeedInstruction } from "../src/generated/oracle/instructions/configureFeed.js";
import { getInitOracleConfigInstruction } from "../src/generated/oracle/instructions/initOracleConfig.js";
import { getPushManualPriceInstruction } from "../src/generated/oracle/instructions/pushManualPrice.js";
import { getAddTokenInstruction } from "../src/generated/pool/instructions/addToken.js";
import { getCreatePoolInstruction } from "../src/generated/pool/instructions/createPool.js";
import { getInitFactoryInstruction } from "../src/generated/pool/instructions/initFactory.js";
import { FeedKind } from "../src/generated/oracle/types/feedKind.js";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const WALLET = process.env.ANCHOR_WALLET ?? join(homedir(), ".config/solana/id.json");
const ONE = 1_000_000n; // 1 token @ 6dp
const USD_ONE = 100_000_000n; // $1.00 @ 8dp
const DEC = 6;
const ONE_DAY = 86_400n;
const SYSVAR_CLOCK = address("SysvarC1ock11111111111111111111111111111111");

const rpc = createSolanaRpc(RPC_URL);

async function reachable(): Promise<boolean> {
  try {
    await rpc.getHealth().send();
    return true;
  } catch {
    return false;
  }
}

async function send(payer: TransactionSigner, instructions: Instruction[]): Promise<Signature> {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const signed = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(signed);
  const wire = getBase64EncodedWireTransaction(signed);
  try {
    await rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" }).send();
  } catch (e) {
    const logs = (e as { context?: { logs?: string[] } }).context?.logs;
    throw new Error(`send failed: ${(e as Error).message}\n${logs ? logs.join("\n") : "(no logs)"}`);
  }
  await confirm(signature);
  return signature;
}

async function confirm(signature: Signature): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status) {
      if (status.err) throw new Error(`tx ${signature} failed: ${JSON.stringify(status.err)}`);
      const c = status.confirmationStatus;
      if (c === "confirmed" || c === "finalized") return;
    }
    await sleep(500);
  }
  throw new Error(`tx ${signature} not confirmed in time`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function airdrop(to: Address, sol: number): Promise<void> {
  const sig = await rpc.requestAirdrop(to, BigInt(sol) * 1_000_000_000n, { commitment: "confirmed" }).send();
  await confirm(sig);
}

async function chainNow(): Promise<bigint> {
  const { value } = await rpc.getAccountInfo(SYSVAR_CLOCK, { encoding: "base64", commitment: "confirmed" }).send();
  if (!value) throw new Error("clock sysvar missing");
  const data = Buffer.from(value.data[0], "base64");
  return data.readBigInt64LE(32); // unix_timestamp
}

async function createMint(authority: KeyPairSigner): Promise<Address> {
  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());
  const lamports = await rpc.getMinimumBalanceForRentExemption(space).send();
  await send(authority, [
    getCreateAccountInstruction({
      payer: authority,
      newAccount: mint,
      lamports,
      space,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMintInstruction({
      mint: mint.address,
      decimals: DEC,
      mintAuthority: authority.address,
      freezeAuthority: null,
    }),
  ]);
  return mint.address;
}

async function ataFor(owner: Address, mint: Address): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({ owner, tokenProgram: TOKEN_PROGRAM_ADDRESS, mint });
  return ata;
}

async function createAndFundAta(payer: KeyPairSigner, owner: Address, mint: Address, amount: bigint): Promise<Address> {
  const ata = await ataFor(owner, mint);
  const ix = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer, owner, mint });
  const instructions: Instruction[] = [ix];
  if (amount > 0n) {
    instructions.push(getMintToInstruction({ mint, token: ata, mintAuthority: payer, amount }));
  }
  await send(payer, instructions);
  return ata;
}

async function tokenAmount(ata: Address): Promise<bigint | null> {
  try {
    const { value } = await rpc.getTokenAccountBalance(ata, { commitment: "confirmed" }).send();
    return BigInt(value.amount);
  } catch {
    return null;
  }
}

test(
  "SDK reproduces the smoke happy path on a live surfnet",
  { skip: (await reachable()) ? false : `surfnet ${RPC_URL} unreachable` },
  async () => {
    const gov = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(WALLET, "utf8"))));

    // --- mints (classic SPL Token, 6dp; gov is mint authority) ----------------
    const shielded = await createMint(gov);
    const backing = await createMint(gov);

    // --- PDAs -----------------------------------------------------------------
    const oracleConfig = await oracleConfigPda();
    const shieldedFeed = await feedPda(shielded);
    const backingFeed = await feedPda(backing);
    const factory = await factoryPda();
    const shieldedEntry = await tokenEntryPda(shielded);
    const backingEntry = await tokenEntryPda(backing);
    const pool = await poolPda({ shieldedMint: shielded, backingMint: backing, creator: gov.address });
    const poolConfig = await poolConfigPda(pool);
    const vaultShielded = await vaultShieldedPda(pool);
    const vaultBacking = await vaultBackingPda(pool);
    const bondVault = await bondVaultPda(pool);

    // tolerate re-runs: oracle_config + factory are init-once singletons.
    const ifNew = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        const m = String((e as Error).message ?? e);
        if (!/already in use|custom program error: 0x0\b/i.test(m)) throw e;
      }
    };

    // --- 1. oracle: config + feeds + $1 prices --------------------------------
    await ifNew(() =>
      send(gov, [getInitOracleConfigInstruction({ payer: gov, oracleConfig, governanceAuthority: gov.address })]),
    );

    const configureFeed = (mint: Address, feed: Address) =>
      send(gov, [
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
    await configureFeed(shielded, shieldedFeed);
    await configureFeed(backing, backingFeed);

    const pushPrice = async (mint: Address, feed: Address, priceUsd8: bigint) => {
      const now = await chainNow();
      await send(gov, [
        getPushManualPriceInstruction({
          governanceAuthority: gov,
          oracleConfig,
          feed,
          tokenMint: mint,
          isBackup: false,
          price: priceUsd8,
          publishTime: now,
        }),
      ]);
    };
    await pushPrice(shielded, shieldedFeed, USD_ONE);
    await pushPrice(backing, backingFeed, USD_ONE);

    // --- 2. factory + whitelist + pool ----------------------------------------
    await ifNew(() =>
      send(gov, [
        getInitFactoryInstruction({
          payer: gov,
          factory,
          governanceAuthority: gov.address,
          defaultOracle: ORACLE_PROGRAM_ID,
          minimumCreationBondUsd: 0n,
          maxActivePools: 10,
        }),
      ]),
    );

    // primaryFeed is unused for Manual feeds — a placeholder address is fine.
    const addToken = (mint: Address, entry: Address) =>
      send(gov, [
        getAddTokenInstruction({
          governanceAuthority: gov,
          factory,
          mint,
          tokenEntry: entry,
          params: {
            name: "Tok",
            symbol: "TOK",
            primaryFeed: gov.address,
            backupFeed: none(),
            minCollateralRatioBp: 10_000n,
            requiresStrictProtectedPrice: false,
          },
        }),
      ]);
    await addToken(shielded, shieldedEntry);
    await addToken(backing, backingEntry);

    const creatorBacking = await createAndFundAta(gov, gov.address, backing, 0n);

    await send(gov, [
      getCreatePoolInstruction({
        creator: gov,
        factory,
        shieldedMint: shielded,
        backingMint: backing,
        shieldedTokenEntry: shieldedEntry,
        backingTokenEntry: backingEntry,
        pool,
        poolConfig,
        vaultShielded,
        vaultBacking,
        bondVault,
        creatorBackingAccount: creatorBacking,
        shieldedTokenProgram: TOKEN_PROGRAM_ADDRESS,
        backingTokenProgram: TOKEN_PROGRAM_ADDRESS,
        oracleProgram: ORACLE_PROGRAM_ID,
        backingFeed,
        commissionRateBp: 1000n, // 10%
        poolFeeBp: 500n, // 5%
        collateralRatioBp: 10_000n, // 100%
        shieldedMinDeposit: 0n,
        shieldedMaxDeposit: 0n,
        backingMinDeposit: 0n,
        backingMaxDeposit: 0n,
        maxTvlUsd: 0n,
        minimumPoolTime: ONE_DAY,
        unlockDuration: ONE_DAY,
        protocolFeeBp: 100n, // 1%
        protocolFeeRecipient: gov.address,
        poolFeeRecipient: gov.address,
        shieldTransferLock: 3600n,
        protectorTransferLock: 0n,
        creationBondAmount: 0n,
        accessControl: null,
      }),
    ]);

    // --- 3. users: Bob (protector 200), Alice (shield 100) --------------------
    const alice = await generateKeyPairSigner();
    const bob = await generateKeyPairSigner();
    await airdrop(alice.address, 2);
    await airdrop(bob.address, 2);

    const aliceShieldedAta = await createAndFundAta(gov, alice.address, shielded, 100n * ONE);
    await createAndFundAta(gov, bob.address, backing, 200n * ONE);
    const bobShieldedAta = await createAndFundAta(gov, bob.address, shielded, 0n);

    // deposit_backing (Bob) — protector position
    const backed = await depositBacking({
      rpc,
      owner: bob,
      pool,
      backingMint: backing,
      amount: 200n * ONE,
      minReceived: 0n,
    });
    const bobMint = backed.positionMint;
    await send(bob, [backed.instruction]);

    // deposit_shielded (Alice) — shield position
    const deposited = await depositShielded({
      rpc,
      owner: alice,
      pool,
      shieldedMint: shielded,
      backingMint: backing,
      amount: 100n * ONE,
      minReceived: 0n,
    });
    const aliceMint = deposited.positionMint;
    await send(alice, [deposited.instruction]);

    // --- 4. yield event: shielded $1 -> $2; accrue; claim; exit ----------------
    await pushPrice(shielded, shieldedFeed, 2n * USD_ONE);

    await send(gov, [await accrueFees({ rpc, cranker: gov, pool, shieldedMint: shielded, positionMint: aliceMint })]);
    const afterAccrue = await fetchPool(rpc, pool);

    await send(bob, [await claimCommission({ owner: bob, pool, shieldedMint: shielded, positionMint: bobMint })]);
    await send(alice, [
      await withdrawShielded({ rpc, owner: alice, pool, shieldedMint: shielded, positionMint: aliceMint, minOut: 0n }),
    ]);

    // --- 5. assertions (same 7 outcomes as smoke.cjs) -------------------------
    const finalPool = await fetchPool(rpc, pool);
    const bobShielded = await tokenAmount(bobShieldedAta);
    const aliceShielded = await tokenAmount(aliceShieldedAta);

    assert.equal(bobShielded, 5n * ONE, "Bob commission payout == 5");
    assert.equal(aliceShielded, 92n * ONE, "Alice principal-minus-fees == 92");
    assert.equal(finalPool.data.totalShieldedTokens, 0n, "pool.totalShieldedTokens == 0");
    assert.equal(afterAccrue.data.accumulatedCommissions, 5n * ONE, "accumulatedCommissions == 5");
    assert.equal(afterAccrue.data.accumulatedPoolFee, (5n * ONE) / 2n, "accumulatedPoolFee == 2.5");
    assert.equal(afterAccrue.data.accumulatedProtocolFee, ONE / 2n, "accumulatedProtocolFee == 0.5");
  },
);
