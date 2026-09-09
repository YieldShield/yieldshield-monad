/**
 * Vercel serverless faucet — same-project sibling of the standalone services/faucet-server.mjs.
 *
 * The browser can't hold the mock-token mint authority, so this server-side function does: on
 * `POST /api/drip { recipient }` it signs (with the governance keypair from FAUCET_GOV_SECRET) a
 * basket of mint-to instructions for the provisioned mock tokens and submits them. DEVNET ONLY —
 * the mints are worthless mocks.
 *
 * Differs from the long-running service in two deliberate ways so it fits a serverless budget:
 *  - it submits the transactions and returns (no confirmation polling) → finishes in a few seconds,
 *    under the 10s Hobby function limit. The tokens land a moment after the HTTP response.
 *  - the rate-limit map is per-instance/best-effort (serverless instances aren't shared) — fine for
 *    a devnet mock faucet.
 *
 * Required env (server-side, NOT VITE_*):
 *   FAUCET_GOV_SECRET  JSON array of the 64-byte governance secret key (the mock mints' authority).
 * Optional:
 *   FAUCET_RPC_URL     devnet RPC (default https://api.devnet.solana.com)
 *   FAUCET_MINTS_JSON  inline mints catalog; defaults to the bundled devnet-faucet-mints.json
 *   DRIP_USD           USD-equivalent minted per token (default 1000)
 *   COOLDOWN_SEC       per-recipient cooldown (default 60)
 */
import { readFileSync } from "node:fs";
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

const RPC_URL = process.env.FAUCET_RPC_URL ?? "https://api.devnet.solana.com";
const DRIP_USD = Number(process.env.DRIP_USD ?? 1000);
const COOLDOWN_MS = Number(process.env.COOLDOWN_SEC ?? 60) * 1000;

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
            let delay = 400;
            for (let i = 0; i < 6; i++) {
              try {
                return await origSend(...sargs);
              } catch (e) {
                if (!is429(e) || i === 5) throw e;
                await sleep(delay);
                delay = Math.min(delay * 2, 4000);
              }
            }
          };
        }
        return pending;
      };
    },
  });
}

// -- lazily-initialised singletons (reused across warm invocations) -----------
let _ctx;
function ctx() {
  if (_ctx) return _ctx;
  const raw = process.env.FAUCET_MINTS_JSON
    ? process.env.FAUCET_MINTS_JSON
    : readFileSync(new URL("../devnet-faucet-mints.json", import.meta.url), "utf8");
  const db = JSON.parse(raw);
  const tokens = Object.values(db.tokens ?? {});
  const secret = process.env.FAUCET_GOV_SECRET;
  if (!secret) throw new Error("FAUCET_GOV_SECRET is not set");
  const govPromise = createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(secret)));
  const rpc = retryingRpc(createSolanaRpc(RPC_URL));
  _ctx = { tokens, govPromise, rpc };
  return _ctx;
}

/** Build create-ATA (idempotent) + mint-to instructions for one token → recipient. */
async function dripInstructions(gov, recipient, tok) {
  const { mod, PROGRAM } = apiFor(tok.tokenProgram);
  const mint = address(tok.mint);
  const [ata] = await mod.findAssociatedTokenPda({ owner: recipient, tokenProgram: PROGRAM, mint });
  const amount = BigInt(Math.round((DRIP_USD / tok.approxPriceUsd) * 10 ** tok.decimals));
  return {
    ixs: [
      await mod.getCreateAssociatedTokenIdempotentInstructionAsync({ payer: gov, owner: recipient, mint }),
      mod.getMintToInstruction({ mint, token: ata, mintAuthority: gov, amount }),
    ],
    meta: { symbol: tok.symbol, amount: DRIP_USD / tok.approxPriceUsd },
  };
}

async function drip(recipientStr) {
  const { tokens, govPromise, rpc } = ctx();
  const gov = await govPromise;
  const recipient = address(recipientStr); // throws on invalid pubkey
  const built = await Promise.all(tokens.map((t) => dripInstructions(gov, recipient, t)));
  const minted = built.map((b) => b.meta);
  const ixs = built.flatMap((b) => b.ixs);

  // One blockhash for all chunks; submit (don't poll for confirmation) so we finish fast.
  const { value: bh } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  for (let i = 0; i < ixs.length; i += 6) {
    const chunk = ixs.slice(i, i + 6);
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(gov, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
      (m) => appendTransactionMessageInstructions(chunk, m),
    );
    const signed = await signTransactionMessageWithSigners(msg);
    getSignatureFromTransaction(signed); // surfaces a sign error early
    await rpc
      .sendTransaction(getBase64EncodedWireTransaction(signed), {
        encoding: "base64",
        preflightCommitment: "confirmed",
      })
      .send();
  }
  return minted;
}

// -- best-effort per-recipient cooldown (per warm instance) -------------------
const cooldown = new Map();

export default async function handler(req, res) {
  const send = (code, body) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };

  if (req.method === "GET") {
    let ok = true;
    let gov = null;
    try {
      gov = (await ctx().govPromise).address;
    } catch {
      ok = false;
    }
    return send(200, { ok, cluster: RPC_URL, gov, dripUsd: DRIP_USD });
  }
  if (req.method !== "POST") return send(405, { ok: false, error: "Method not allowed." });

  // Vercel parses JSON bodies into req.body; fall back to raw string just in case.
  let recipient;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    recipient = String(body.recipient ?? "");
    address(recipient); // validate pubkey
  } catch {
    return send(400, { ok: false, error: "Invalid or missing recipient wallet." });
  }

  const last = cooldown.get(recipient) ?? 0;
  const waitMs = last + COOLDOWN_MS - Date.now();
  if (waitMs > 0) {
    return send(429, { ok: false, error: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting again.` });
  }
  cooldown.set(recipient, Date.now());

  try {
    const minted = await drip(recipient);
    return send(200, { ok: true, minted });
  } catch (e) {
    cooldown.delete(recipient); // failed → let them retry
    const msg = String(e?.message ?? e);
    if (/FAUCET_GOV_SECRET/.test(msg)) return send(500, { ok: false, error: "Faucet isn't configured." });
    return send(502, { ok: false, error: "Faucet couldn't complete the drip. Try again shortly." });
  }
}
