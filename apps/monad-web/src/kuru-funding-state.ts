import type { Address } from "viem";
import { buildKuruSwapRequest, type KuruQuote } from "../../../services/monad/kuru-contracts.mjs";

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
