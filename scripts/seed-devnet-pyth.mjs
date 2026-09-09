/**
 * Seed Solana DEVNET with a real-Pyth SOL/USDC pool and prove the oracle CPI end-to-end.
 *
 * Unlike `seed-demo.mjs` (local surfnet, Manual feeds), this configures the feeds as `FeedKind.Pyth`
 * pointing at devnet's live, auto-updating Pyth `PriceUpdateV2` price accounts, then drives a real
 * `deposit_shielded` — the first instruction that actually reads the Pyth feeds through the pool→
 * oracle CPI. A successful deposit with a sensible `value_at_deposit` (~SOL spot) is the acceptance
 * signal that real Pyth pricing works on devnet.
 *
 * The governance wallet plays every role (governance + protector + saver), so no per-user airdrops
 * are needed (devnet airdrops are rate-limited). It creates its own test mints and prices them off
 * the SOL / USDC Pyth feeds.
 *
 * Usage (both programs already deployed to devnet):
 *   RPC_URL=https://api.devnet.solana.com node app/scripts/seed-devnet-pyth.mjs
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
  fetchShieldPosition,
  ORACLE_PROGRAM_ID,
  oracleClient,
  oracleConfigPda,
  poolClient,
  poolConfigPda,
  poolPda,
  shieldPositionPda,
  tokenEntryPda,
  vaultBackingPda,
  vaultShieldedPda,
} from "@yieldshield/sdk";

const { getConfigureFeedInstruction, getInitOracleConfigInstruction, FeedKind } = oracleClient;
const { getAddTokenInstruction, getCreatePoolInstruction, getInitFactoryInstruction } = poolClient;

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const WALLET = process.env.ANCHOR_WALLET ?? join(homedir(), ".config/solana/id.json");

// Live, auto-updating Pyth `PriceUpdateV2` accounts on devnet (owner = Pyth receiver rec5...).
const PYTH_SOL_USD = address("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");
const PYTH_USDC_USD = address("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX");

const USD_ONE = 100_000_000n; // USD, 8 decimals
const SOL_DEC = 9; // shielded (SOL-like) mint decimals
const USDC_DEC = 6; // backing (USDC-like) mint decimals
const ONE_DAY = 86_400n;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wrap a kit RPC so every request `.send()` retries on HTTP 429 (Too Many Requests) with
 * exponential backoff. The public devnet endpoint is aggressively rate-limited; this makes both
 * our direct calls AND the SDK actions' internal reads (which receive this same rpc) resilient.
 */
function retryingRpc(base) {
  const is429 = (e) => {
    const code = e?.context?.statusCode ?? e?.statusCode;
    return code === 429 || /\b429\b|Too Many Requests/i.test(String(e?.message ?? e));
  };
  return new Proxy(base, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== "function") return orig;
      return (...args) => {
        const pending = orig.apply(target, args);
        if (pending && typeof pending.send === "function") {
          const origSend = pending.send.bind(pending);
          pending.send = async (...sargs) => {
            let delay = 600;
            for (let i = 0; i < 9; i++) {
              try {
                return await origSend(...sargs);
              } catch (e) {
                if (!is429(e) || i === 8) throw e;
                await sleep(delay);
                delay = Math.min(delay * 2, 8000);
              }
            }
          };
        }
        return pending;
      };
    },
  });
}

const rpc = retryingRpc(createSolanaRpc(RPC_URL));

async function confirm(sig) {
  for (let i = 0; i < 90; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const s = value[0];
    if (s) {
      if (s.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(s.err)}`);
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") return;
    }
    await sleep(500);
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

async function createMint(gov, decimals) {
  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());
  const lamports = await rpc.getMinimumBalanceForRentExemption(space).send();
  await send(gov, [
    getCreateAccountInstruction({ payer: gov, newAccount: mint, lamports, space, programAddress: TOKEN_PROGRAM_ADDRESS }),
    getInitializeMintInstruction({ mint: mint.address, decimals, mintAuthority: gov.address, freezeAuthority: null }),
  ]);
  return mint.address;
}

async function ataFor(owner, mint) {
  const [a] = await findAssociatedTokenPda({ owner, tokenProgram: TOKEN_PROGRAM_ADDRESS, mint });
  return a;
}

async function fundAta(gov, owner, mint, amount) {
  const ata = await ataFor(owner, mint);
  const ixs = [await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: gov, owner, mint })];
  if (amount > 0n) ixs.push(getMintToInstruction({ mint, token: ata, mintAuthority: gov, amount }));
  await send(gov, ixs);
  return ata;
}

const initIfAbsent = async (pda, label, fn) => {
  // base64: the public devnet RPC rejects default base58 for accounts >128 bytes.
  const { value } = await rpc.getAccountInfo(pda, { commitment: "confirmed", encoding: "base64" }).send();
  if (value) {
    console.log(`  (${label} exists, skipping)`);
    return;
  }
  await fn();
};

/** Configure a token's feed to read a live Pyth devnet price account (no manual push needed). */
async function configurePythFeed(gov, mint, priceAccount) {
  await send(gov, [
    getConfigureFeedInstruction({
      governanceAuthority: gov,
      oracleConfig: await oracleConfigPda(),
      feed: await feedPda(mint),
      tokenMint: mint,
      primary: { kind: FeedKind.Pyth, account: priceAccount },
      backup: none(),
      requiresStrict: false,
      maxPriceAge: 300n, // devnet Pyth updates every ~6-14s; 300s is safe headroom
      maxConfidenceBps: 500n, // observed conf ~6bps
      maxDeviationBps: 500n,
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

// ---------------------------------------------------------------------------

const gov = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(WALLET, "utf8"))));
console.log(`Seeding devnet Pyth pool as ${gov.address} on ${RPC_URL}`);

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
      minimumCreationBondUsd: 0n, // no bond → create_pool skips the oracle read
      maxActivePools: 50,
    }),
  ]),
);

// -- mints + Pyth feeds ------------------------------------------------------
const shielded = await createMint(gov, SOL_DEC); // SOL-like
const backing = await createMint(gov, USDC_DEC); // USDC-like
console.log(`  shielded (SOL) mint ${shielded}`);
console.log(`  backing  (USDC) mint ${backing}`);
await configurePythFeed(gov, shielded, PYTH_SOL_USD);
await configurePythFeed(gov, backing, PYTH_USDC_USD);
await addToken(gov, shielded, "SOL");
await addToken(gov, backing, "USDC");
console.log("  ✓ feeds configured to live devnet Pyth (SOL/USD, USDC/USD)");

// -- create pool -------------------------------------------------------------
const pool = await poolPda({ shieldedMint: shielded, backingMint: backing, creator: gov.address });
const creatorBacking = await fundAta(gov, gov.address, backing, 0n);
await send(gov, [
  getCreatePoolInstruction({
    creator: gov,
    factory: await factoryPda(),
    shieldedMint: shielded,
    backingMint: backing,
    shieldedTokenEntry: await tokenEntryPda(shielded),
    backingTokenEntry: await tokenEntryPda(backing),
    pool,
    poolConfig: await poolConfigPda(pool),
    vaultShielded: await vaultShieldedPda(pool),
    vaultBacking: await vaultBackingPda(pool),
    bondVault: await bondVaultPda(pool),
    creatorBackingAccount: creatorBacking,
    shieldedTokenProgram: TOKEN_PROGRAM_ADDRESS,
    backingTokenProgram: TOKEN_PROGRAM_ADDRESS,
    oracleProgram: ORACLE_PROGRAM_ID,
    backingFeed: await feedPda(backing),
    commissionRateBp: 1000n,
    poolFeeBp: 500n,
    collateralRatioBp: 10_000n,
    shieldedMinDeposit: 0n,
    shieldedMaxDeposit: 0n,
    backingMinDeposit: 0n,
    backingMaxDeposit: 0n,
    maxTvlUsd: 10_000_000n * USD_ONE,
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
console.log(`  ✓ pool ${pool}`);

// -- protector backing (gov) : 200 USDC so shield coverage exists ------------
const BACKING_AMOUNT = 200n * 10n ** BigInt(USDC_DEC);
await fundAta(gov, gov.address, backing, BACKING_AMOUNT);
{
  const { instruction } = await depositBacking({ rpc, owner: gov, pool, backingMint: backing, amount: BACKING_AMOUNT, minReceived: 0n });
  await send(gov, [instruction]);
  console.log(`  ✓ protector deposit 200 USDC`);
}

// -- saver deposit (gov) : 1 SOL — THE real Pyth CPI ------------------------
const SHIELD_AMOUNT = 1n * 10n ** BigInt(SOL_DEC);
await fundAta(gov, gov.address, shielded, SHIELD_AMOUNT);
let positionMint;
{
  const dep = await depositShielded({ rpc, owner: gov, pool, shieldedMint: shielded, backingMint: backing, amount: SHIELD_AMOUNT, minReceived: 0n });
  positionMint = dep.positionMint;
  await send(gov, [dep.instruction]);
  console.log(`  ✓ saver deposit 1 SOL (position ${positionMint})`);
}

// -- verify the Pyth-priced valuation ---------------------------------------
const pos = await fetchShieldPosition(rpc, await shieldPositionPda(positionMint));
const valueUsd = Number(pos.data.valueAtDeposit) / 1e8;
console.log(`\n✅ Pyth CPI OK — 1 SOL valued at $${valueUsd.toFixed(2)} at deposit (live devnet SOL/USD).`);
console.log(`\nPool:     ${pool}`);
console.log(`Shielded: ${shielded} (SOL, ${SOL_DEC}dp)`);
console.log(`Backing:  ${backing} (USDC, ${USDC_DEC}dp)`);
console.log(`Set VITE_POOL_REGISTRY_JSON or reload the app to see it.`);
