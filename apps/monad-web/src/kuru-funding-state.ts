import type { Address } from "viem";
import {
  buildKuruSwapRequest,
  validateKuruInput,
  validateKuruQuote,
  type KuruQuote,
  type KuruAccount,
} from "../../../services/monad/kuru-contracts.mjs";

// A quote may be reviewed before custody is funded or a root ID is created.
// It becomes executable only through the stricter balance/account gate below.
export function fundableKuruQuote(
  quote: KuruQuote | null,
  state: { account: Address | null; userId?: bigint; amountIn: bigint },
  now = Date.now(),
) {
  if (!quote || !state.account || state.userId === undefined || quote.amountIn !== state.amountIn) return null;
  try {
    validateKuruQuote(quote, state.account, state.userId, now);
    return quote;
  } catch {
    return null;
  }
}

export async function depositKuruFunding(
  amountIn: bigint,
  steps: {
    readAccount: () => Promise<KuruAccount>;
    preflight: () => Promise<unknown>;
    approve: (amount: bigint) => Promise<unknown>;
    deposit: (amount: bigint) => Promise<unknown>;
  },
) {
  validateKuruInput(amountIn);
  const current = await steps.readAccount();
  const missing = amountIn - current.usdc;
  if (missing <= 0n) return;
  if (current.walletUsdc < missing)
    throw new Error("Request current Kuru test USDC from your Kuru integration contact first.");
  await steps.preflight();
  await steps.approve(missing);
  // Approval can wait in a wallet prompt. Recheck liquidity and recoverability
  // before custody receives funds, without retrying either transaction.
  await steps.preflight();
  const latest = await steps.readAccount();
  if (
    latest.account.toLowerCase() !== current.account.toLowerCase() ||
    latest.usdc !== current.usdc ||
    latest.walletUsdc < missing
  )
    throw new Error("Kuru balance changed. Review the amount before depositing.");
  await steps.deposit(missing);
}

// An asynchronous quote must not survive a wallet change, failed balance read,
// withdrawal of its input, or expiry as an enabled confirmation in the UI.
export function reviewableKuruQuote(
  quote: KuruQuote | null,
  state: { account: Address | null; userId?: bigint; amountIn: bigint; freeUsdc?: bigint },
  now = Date.now(),
) {
  if (
    !quote ||
    !state.account ||
    state.userId === undefined ||
    state.freeUsdc === undefined ||
    state.freeUsdc < state.amountIn ||
    quote.amountIn !== state.amountIn
  )
    return null;
  try {
    buildKuruSwapRequest(quote, state.account, state.userId, now);
    return quote;
  } catch {
    return null;
  }
}
