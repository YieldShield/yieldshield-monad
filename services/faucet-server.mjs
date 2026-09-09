/**
 * Self-serve devnet faucet service for the YieldShield app.
 *
 * The browser can't hold the mock-token mint authority, so this tiny HTTP service does: it holds the
 * governance (mint-authority) keypair and, on `POST /drip { recipient }`, mints a basket of the
 * provisioned mock tokens (from `app/devnet-faucet-mints.json`) to that wallet. The Account screen's
 * "Get test tokens" button calls it. DEVNET ONLY — the mints are worthless mocks.
 *
 * Run it (governance wallet must have devnet SOL for rent + fees):
 *   cd app
 *   RPC_URL=https://api.devnet.solana.com FAUCET_ORIGIN=http://localhost:5173 \
 *     npx tsx services/faucet-server.mjs
 * Then point the web app at it: VITE_FAUCET_URL=http://localhost:8787
 *
 * Env: FAUCET_PORT=8787 · RPC_URL · ANCHOR_WALLET · FAUCET_ORIGIN=* · DRIP_USD=1000 · COOLDOWN_SEC=60
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import * as splToken from "@solana-program/token";
import * as token22 from "@solana-program/token-2022";

const PORT = Number(process.env.FAUCET_PORT ?? 8787);
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const WALLET = process.env.ANCHOR_WALLET ?? join(homedir(), ".config/solana/id.json");
const ORIGIN = process.env.FAUCET_ORIGIN ?? "*";
const DRIP_USD = Number(process.env.DRIP_USD ?? 1000);
const COOLDOWN_MS = Number(process.env.COOLDOWN_SEC ?? 60) * 1000;
const MINTS_FILE = join(dirname(dirname(fileURLToPath(import.meta.url))), "devnet-faucet-mints.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const apiFor = (tp) =>
  tp === "token2022"
    ? { mod: token22, PROGRAM: token22.TOKEN_2022_PROGRAM_ADDRESS }
    : { mod: splToken, PROGRAM: splToken.TOKEN_PROGRAM_ADDRESS };

// -- rate-limit-resilient RPC (public devnet throttles hard) ------------------
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

if (!existsSync(MINTS_FILE)) {
  console.error(`No ${MINTS_FILE}. Run \`npx tsx scripts/faucet-devnet.mjs setup\` first.`);
  process.exit(1);
}
const db = JSON.parse(readFileSync(MINTS_FILE, "utf8"));
const TOKENS = Object.values(db.tokens ?? {});
const gov = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(WALLET, "utf8"))));

async function confirm(sig) {
  for (let i = 0; i < 120; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const s = value[0];
    if (s) {
      if (s.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(s.err)}`);
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") return true;
    }
    await sleep(500);
  }
  return false;
}

async function send(instructions) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { value: bh } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
      const msg = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(gov, m),
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
    } catch (e) {
      if (/already in use|already been processed|already processed/i.test(String(e?.message ?? e))) return null;
      if (attempt === 3) throw e;
      await sleep(1000);
    }
  }
}

/** Build create-ATA (idempotent) + mint-to instructions for one token → recipient. */
async function dripInstructions(recipient, tok) {
  const { mod, PROGRAM } = apiFor(tok.tokenProgram);
  const mint = address(tok.mint);
  const [ata] = await mod.findAssociatedTokenPda({ owner: recipient, tokenProgram: PROGRAM, mint });
  const amount = BigInt(Math.round((DRIP_USD / tok.approxPriceUsd) * 10 ** tok.decimals));
  return [
    await mod.getCreateAssociatedTokenIdempotentInstructionAsync({ payer: gov, owner: recipient, mint }),
    mod.getMintToInstruction({ mint, token: ata, mintAuthority: gov, amount }),
    { symbol: tok.symbol, human: DRIP_USD / tok.approxPriceUsd },
  ];
}

async function drip(recipientStr) {
  const recipient = address(recipientStr); // throws on invalid pubkey
  const built = await Promise.all(TOKENS.map((t) => dripInstructions(recipient, t)));
  const minted = built.map(([, , meta]) => ({ symbol: meta.symbol, amount: meta.human }));
  const ixs = built.flatMap(([createAta, mintTo]) => [createAta, mintTo]);
  // Chunk to keep each tx small (~3 tokens / 6 instructions per tx).
  for (let i = 0; i < ixs.length; i += 6) await send(ixs.slice(i, i + 6));
  return minted;
}

// -- HTTP ---------------------------------------------------------------------
const cooldown = new Map(); // recipient → last drip ms
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", ...cors });
  res.end(JSON.stringify(body));
};

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      ok: true,
      cluster: RPC_URL,
      gov: gov.address,
      dripUsd: DRIP_USD,
      tokens: TOKENS.map((t) => t.symbol),
    });
  }
  if (req.method === "POST" && req.url === "/drip") {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 4096) req.destroy();
    });
    req.on("end", async () => {
      let recipient;
      try {
        recipient = String(JSON.parse(raw).recipient ?? "");
        address(recipient); // validate
      } catch {
        return json(res, 400, { ok: false, error: "Invalid or missing recipient wallet." });
      }
      const last = cooldown.get(recipient) ?? 0;
      const waitMs = last + COOLDOWN_MS - nowMs();
      if (waitMs > 0) {
        return json(res, 429, {
          ok: false,
          error: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting again.`,
        });
      }
      cooldown.set(recipient, nowMs());
      try {
        const minted = await drip(recipient);
        console.log(`dripped ${minted.length} tokens → ${recipient}`);
        json(res, 200, { ok: true, minted });
      } catch (e) {
        cooldown.delete(recipient); // failed → let them retry
        console.error("drip failed:", e?.message ?? e);
        json(res, 502, { ok: false, error: "Faucet couldn't complete the drip. Try again shortly." });
      }
    });
    return;
  }
  json(res, 404, { ok: false, error: "Not found." });
});

// `Date.now` is fine in a plain Node service (unlike workflow scripts).
function nowMs() {
  return Date.now();
}

server.listen(PORT, () => {
  console.log(`YieldShield faucet on :${PORT} — ${TOKENS.length} tokens, $${DRIP_USD}/token, gov ${gov.address}`);
  console.log(`  cluster ${RPC_URL} · CORS ${ORIGIN} · cooldown ${COOLDOWN_MS / 1000}s`);
});
