/**
 * Devnet faucet for YieldShield's Solana token seed set.
 *
 * The real yield-bearing tokens (USDY, sUSDe, syrupUSDC, …) can't be sourced on devnet — their
 * mints don't exist there and their Pyth feeds aren't devnet-sponsored. So this faucet stands up
 * MOCK representations: for every entry in the SDK `TOKEN_CATALOG` it creates a fresh mint with the
 * SAME decimals + token program as the real token (6/8/9 dp; PYUSD as Token-2022), configures a
 * Manual oracle feed pinned to a realistic USD price, and whitelists it. Governance is the mint
 * authority, so it can drip any amount to any wallet on demand.
 *
 * Provisioned mints are persisted to `app/devnet-faucet-mints.json` so re-runs are idempotent and
 * the app / other scripts can discover them.
 *
 * Usage (both programs already deployed to devnet, governance wallet funded). Run with `tsx` — the
 * SDK's built ESM uses directory imports that plain `node` won't resolve (same as the seed scripts):
 *   cd app && RPC_URL=https://api.devnet.solana.com npx tsx scripts/faucet-devnet.mjs setup
 *   npx tsx scripts/faucet-devnet.mjs list
 *   npx tsx scripts/faucet-devnet.mjs drip <recipient> [usdPerToken=1000]   # a basket to a wallet
 *   npx tsx scripts/faucet-devnet.mjs mint <SYMBOL> <recipient> <humanAmount>
 *   npx tsx scripts/faucet-devnet.mjs pools                                  # 3 example pools
 *
 * This is a DEV tool — it is not part of the app bundle.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import * as splToken from "@solana-program/token";
import * as token22 from "@solana-program/token-2022";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  approxPriceUsd8,
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
  TOKEN_CATALOG,
  tokenEntryPda,
  vaultBackingPda,
  vaultShieldedPda,
} from "@yieldshield/sdk";

const { getConfigureFeedInstruction, getInitOracleConfigInstruction, getPushManualPriceInstruction, FeedKind } =
  oracleClient;
const { getAddTokenInstruction, getCreatePoolInstruction, getInitFactoryInstruction, getSetMaxActivePoolsInstruction } =
  poolClient;

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const WALLET = process.env.ANCHOR_WALLET ?? join(homedir(), ".config/solana/id.json");
const MINTS_FILE = join(dirname(dirname(fileURLToPath(import.meta.url))), "devnet-faucet-mints.json");

const USD_ONE = 100_000_000n; // USD, 8 decimals
const ONE_DAY = 86_400n;
const SYSVAR_CLOCK = address("SysvarC1ock11111111111111111111111111111111");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -- token-program-aware helpers ---------------------------------------------
// PYUSD is Token-2022; the rest are classic SPL. Each package exposes the same API bound to its own
// program id, so we pick the module per token and never mix program ids.
const apiFor = (tokenProgram) =>
  tokenProgram === "token2022"
    ? { mod: token22, PROGRAM: token22.TOKEN_2022_PROGRAM_ADDRESS }
    : { mod: splToken, PROGRAM: splToken.TOKEN_PROGRAM_ADDRESS };

// -- rate-limit-resilient RPC (public devnet is aggressively throttled) -------
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

/** Poll a signature to `confirmed`. Returns true if confirmed, false if it timed out (dropped). */
async function confirm(sig) {
  for (let i = 0; i < 150; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const s = value[0];
    if (s) {
      if (s.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(s.err)}`);
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") return true;
    }
    await sleep(500);
  }
  return false; // not confirmed within ~75s — likely dropped (blockhash expired); caller may retry
}

// The public devnet endpoint drops txs under load. Re-sign with a FRESH blockhash and resend up to
// `attempts` times; a tx that actually landed on a prior attempt surfaces as "already processed"
// (duplicate) or "already in use" (an init/create whose account now exists) — both mean success.
const ALREADY_LANDED = /already in use|already been processed|already processed|has already been processed/i;

async function send(payer, instructions, attempts = 4) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
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
        .sendTransaction(getBase64EncodedWireTransaction(signed), {
          encoding: "base64",
          preflightCommitment: "confirmed",
        })
        .send();
      if (await confirm(sig)) return sig;
      lastErr = new Error(`tx ${sig} not confirmed (attempt ${attempt + 1}/${attempts})`);
    } catch (e) {
      const m = String(e?.message ?? e);
      if (ALREADY_LANDED.test(m)) return null; // a prior attempt actually landed — treat as success
      lastErr = e;
    }
    await sleep(1000);
  }
  throw lastErr;
}

async function chainNow() {
  const { value } = await rpc.getAccountInfo(SYSVAR_CLOCK, { encoding: "base64", commitment: "confirmed" }).send();
  return Buffer.from(value.data[0], "base64").readBigInt64LE(32);
}

/** Run `fn` only if the PDA/account doesn't already exist (idempotent init). */
const initIfAbsent = async (pda, label, fn) => {
  const { value } = await rpc.getAccountInfo(pda, { commitment: "confirmed", encoding: "base64" }).send();
  if (value) {
    console.log(`    (${label} exists, skipping)`);
    return false;
  }
  await fn();
  return true;
};

async function createMockMint(gov, seed) {
  const { mod, PROGRAM } = apiFor(seed.tokenProgram);
  const mint = await generateKeyPairSigner();
  const space = BigInt(mod.getMintSize());
  const lamports = await rpc.getMinimumBalanceForRentExemption(space).send();
  await send(gov, [
    getCreateAccountInstruction({ payer: gov, newAccount: mint, lamports, space, programAddress: PROGRAM }),
    mod.getInitializeMintInstruction({
      mint: mint.address,
      decimals: seed.decimals,
      mintAuthority: gov.address,
      freezeAuthority: null,
    }),
  ]);
  return mint.address;
}

async function ataFor(owner, mint, tokenProgram) {
  const { mod, PROGRAM } = apiFor(tokenProgram);
  const [a] = await mod.findAssociatedTokenPda({ owner, tokenProgram: PROGRAM, mint });
  return a;
}

async function fundAta(gov, owner, mint, amount, tokenProgram) {
  const { mod } = apiFor(tokenProgram);
  const ata = await ataFor(owner, mint, tokenProgram);
  const ixs = [await mod.getCreateAssociatedTokenIdempotentInstructionAsync({ payer: gov, owner, mint })];
  if (amount > 0n) ixs.push(mod.getMintToInstruction({ mint, token: ata, mintAuthority: gov, amount }));
  await send(gov, ixs);
  return ata;
}

/**
 * Configure a Manual feed for `mint` (init-once, guarded on the feed PDA) and ALWAYS (re)push
 * `priceUsd8`. The push is unconditional and idempotent so a half-applied state — feed created but a
 * prior price push dropped on flaky devnet — self-heals on re-run, instead of leaving a $0/stale feed.
 */
async function configureManualFeed(gov, mint, priceUsd8) {
  const oracleConfig = await oracleConfigPda();
  const feed = await feedPda(mint);
  await initIfAbsent(feed, "feed", () =>
    send(gov, [
      getConfigureFeedInstruction({
        governanceAuthority: gov,
        oracleConfig,
        feed,
        tokenMint: mint,
        primary: { kind: FeedKind.Manual, account: gov.address },
        backup: none(),
        requiresStrict: false,
        maxPriceAge: 1_000_000_000n, // never stale — a single manual push holds until re-pushed
        maxConfidenceBps: 200n,
        maxDeviationBps: 500n,
      }),
    ]),
  );
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

async function addToken(gov, mint, seed) {
  await send(gov, [
    getAddTokenInstruction({
      governanceAuthority: gov,
      factory: await factoryPda(),
      mint,
      tokenEntry: await tokenEntryPda(mint),
      params: {
        name: seed.name.slice(0, 64),
        symbol: seed.symbol.slice(0, 32),
        primaryFeed: gov.address,
        backupFeed: none(),
        minCollateralRatioBp: BigInt(seed.minCollateralRatioBp),
        requiresStrictProtectedPrice: false,
      },
    }),
  ]);
}

// -- persistence -------------------------------------------------------------
function loadMints() {
  if (!existsSync(MINTS_FILE)) return { cluster: RPC_URL, gov: null, tokens: {} };
  return JSON.parse(readFileSync(MINTS_FILE, "utf8"));
}
function saveMints(db) {
  writeFileSync(MINTS_FILE, JSON.stringify(db, null, 2) + "\n");
}

async function loadGov() {
  return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(WALLET, "utf8"))));
}

async function ensureFactoryAndOracle(gov) {
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
        minimumCreationBondUsd: 0n, // no bond → create_pool skips the oracle read at creation
        maxActivePools: 50,
      }),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdSetup() {
  const gov = await loadGov();
  console.log(`Faucet setup as ${gov.address} on ${RPC_URL}\n`);
  await ensureFactoryAndOracle(gov);

  const db = loadMints();
  db.cluster = RPC_URL;
  db.gov = gov.address;
  db.tokens ??= {};

  for (const seed of TOKEN_CATALOG) {
    console.log(`• ${seed.symbol} (${seed.decimals}dp, ${seed.tokenProgram}, $${seed.approxPriceUsd})`);
    let entry = db.tokens[seed.symbol];
    if (!entry?.mint) {
      const mint = await createMockMint(gov, seed);
      entry = {
        symbol: seed.symbol,
        name: seed.name,
        mint,
        decimals: seed.decimals,
        tokenProgram: seed.tokenProgram,
        tranche: seed.tranche,
        approxPriceUsd: seed.approxPriceUsd,
        mainnetMint: seed.mainnetMint,
      };
      db.tokens[seed.symbol] = entry;
      saveMints(db); // persist immediately so a mid-run failure doesn't orphan the mint
      console.log(`    created mock mint ${mint}`);
    } else {
      console.log(`    reusing mint ${entry.mint}`);
    }
    const mint = address(entry.mint);
    await configureManualFeed(gov, mint, approxPriceUsd8(seed)); // feed init is guarded inside; price push always runs
    await initIfAbsent(await tokenEntryPda(mint), "whitelist", () => addToken(gov, mint, seed));
  }

  saveMints(db);
  console.log(`\n✓ ${TOKEN_CATALOG.length} tokens provisioned. Mints written to ${MINTS_FILE}`);
}

function requireToken(db, symbol) {
  const entry =
    db.tokens?.[symbol] ?? Object.values(db.tokens ?? {}).find((t) => t.symbol.toLowerCase() === symbol.toLowerCase());
  if (!entry) throw new Error(`token ${symbol} not provisioned — run \`setup\` first`);
  return entry;
}

async function cmdMint(symbol, recipient, humanAmount) {
  const gov = await loadGov();
  const db = loadMints();
  const entry = requireToken(db, symbol);
  const amount = BigInt(Math.round(Number(humanAmount) * 10 ** entry.decimals));
  await fundAta(gov, address(recipient), address(entry.mint), amount, entry.tokenProgram);
  console.log(`✓ minted ${humanAmount} ${entry.symbol} → ${recipient}`);
}

async function cmdDrip(recipient, usdPerToken = "1000") {
  const gov = await loadGov();
  const db = loadMints();
  const usd = Number(usdPerToken);
  for (const entry of Object.values(db.tokens ?? {})) {
    const human = usd / entry.approxPriceUsd;
    const amount = BigInt(Math.round(human * 10 ** entry.decimals));
    await fundAta(gov, address(recipient), address(entry.mint), amount, entry.tokenProgram);
    console.log(`  ✓ ${human.toFixed(4)} ${entry.symbol} (~$${usd})`);
  }
  console.log(`\n✓ dripped a ~$${usd}/token basket → ${recipient}`);
}

function cmdList() {
  const db = loadMints();
  console.log(`cluster: ${db.cluster}\ngov:     ${db.gov}\n`);
  for (const t of Object.values(db.tokens ?? {})) {
    console.log(
      `${t.symbol.padEnd(10)} ${t.mint}  ${String(t.decimals).padStart(2)}dp  ${t.tranche.padEnd(8)} $${t.approxPriceUsd}`,
    );
  }
}

// Example pools from the recommendation: two 100% stable pairs + one 150% volatile pair.
// Governance plays every role (protector + saver) so no rate-limited devnet airdrops are needed.
const EXAMPLE_POOLS = [
  { shielded: "USDY", backing: "syrupUSDC", ratioBp: 10_000n, backingUsd: 3000, saverUsd: 1500 },
  { shielded: "sUSDe", backing: "USDtb", ratioBp: 10_000n, backingUsd: 3000, saverUsd: 1500 },
  { shielded: "JitoSOL", backing: "zBTC", ratioBp: 15_000n, backingUsd: 6000, saverUsd: 1500 },
];

async function createPool(gov, db, spec) {
  const s = requireToken(db, spec.shielded);
  const b = requireToken(db, spec.backing);
  const shielded = address(s.mint);
  const backing = address(b.mint);
  const { PROGRAM: shieldedProgram } = apiFor(s.tokenProgram);
  const { PROGRAM: backingProgram } = apiFor(b.tokenProgram);

  const pool = await poolPda({ shieldedMint: shielded, backingMint: backing, creator: gov.address });
  if ((await rpc.getAccountInfo(pool, { commitment: "confirmed", encoding: "base64" }).send()).value) {
    console.log(`  (${spec.shielded}/${spec.backing} pool ${pool} exists, skipping)`);
    return pool;
  }
  const creatorBacking = await fundAta(gov, gov.address, backing, 0n, b.tokenProgram);
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
      shieldedTokenProgram: shieldedProgram,
      backingTokenProgram: backingProgram,
      oracleProgram: ORACLE_PROGRAM_ID,
      backingFeed: await feedPda(backing),
      commissionRateBp: 1000n,
      poolFeeBp: 500n,
      collateralRatioBp: spec.ratioBp,
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

  // Protector backing (so shield coverage exists), then a saver deposit sized within coverage.
  const backingAmount = BigInt(Math.round((spec.backingUsd / b.approxPriceUsd) * 10 ** b.decimals));
  await fundAta(gov, gov.address, backing, backingAmount, b.tokenProgram);
  {
    const dep = await depositBacking({
      rpc,
      owner: gov,
      pool,
      backingMint: backing,
      amount: backingAmount,
      minReceived: 0n,
    });
    await send(gov, [dep.instruction]);
  }
  const saverAmount = BigInt(Math.round((spec.saverUsd / s.approxPriceUsd) * 10 ** s.decimals));
  await fundAta(gov, gov.address, shielded, saverAmount, s.tokenProgram);
  {
    const dep = await depositShielded({
      rpc,
      owner: gov,
      pool,
      shieldedMint: shielded,
      backingMint: backing,
      amount: saverAmount,
      minReceived: 0n,
    });
    await send(gov, [dep.instruction]);
  }
  console.log(
    `  ✓ ${spec.shielded}/${spec.backing} pool ${pool}  (backing ~$${spec.backingUsd}, shield ~$${spec.saverUsd})`,
  );
  return pool;
}

async function cmdPools() {
  const gov = await loadGov();
  const db = loadMints();
  console.log(`Creating ${EXAMPLE_POOLS.length} example pools as ${gov.address}\n`);

  // Make sure the factory can hold the new pools.
  const f = await import("@yieldshield/sdk");
  const factory = await f.fetchFactory(rpc, await factoryPda());
  if (factory.data.maxActivePools < factory.data.activePoolCount + EXAMPLE_POOLS.length) {
    await send(gov, [
      getSetMaxActivePoolsInstruction({
        governanceAuthority: gov,
        factory: await factoryPda(),
        value: factory.data.activePoolCount + EXAMPLE_POOLS.length + 5,
      }),
    ]);
  }
  for (const spec of EXAMPLE_POOLS) await createPool(gov, db, spec);
  console.log(`\n✓ example pools ready. Reload the app to see them.`);
}

// ---------------------------------------------------------------------------
const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "setup":
    await cmdSetup();
    break;
  case "list":
    cmdList();
    break;
  case "drip":
    if (!rest[0]) throw new Error("usage: drip <recipient> [usdPerToken=1000]");
    await cmdDrip(rest[0], rest[1]);
    break;
  case "mint":
    if (rest.length < 3) throw new Error("usage: mint <SYMBOL> <recipient> <humanAmount>");
    await cmdMint(rest[0], rest[1], rest[2]);
    break;
  case "pools":
    await cmdPools();
    break;
  default:
    console.log(
      [
        "YieldShield devnet faucet",
        "",
        "  setup                              provision all mock mints + Manual feeds + whitelist",
        "  list                               print provisioned mints",
        "  drip <recipient> [usdPerToken]     mint a ~$1000/token basket (default) to a wallet",
        "  mint <SYMBOL> <recipient> <amount> mint a specific token amount to a wallet",
        "  pools                              create the 3 recommended example pools",
        "",
        `RPC_URL=${RPC_URL}`,
      ].join("\n"),
    );
}
