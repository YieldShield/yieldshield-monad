import type { TokenBalance } from "@yieldshield/core";
import type { ProtectionAsset } from "./protection-status";

/** Do not turn an absent or ambiguous token read into a zero balance. */
export function walletHolding(balances: TokenBalance[], symbol: string, tokenAddress?: string) {
  const matches = balances.filter((entry) =>
    tokenAddress ? entry.token.token.toLowerCase() === tokenAddress.toLowerCase() : entry.token.symbol === symbol,
  );
  return matches.length === 1 ? matches[0]! : null;
}

export function summarizeProtection(choices: ProtectionAsset[]) {
  const terms = choices.flatMap((choice) => (choice.pool.terms ? [choice.pool.terms] : []));
  const gains = terms.map((term) => term.commissionBps + term.poolFeeBps + term.protocolFeeBps);
  const waits = terms.map((term) => term.protectedExitDelaySeconds);
  return {
    poolCount: choices.length,
    acceptingCount: choices.filter(
      (choice) => choice.pool.state === "ready" && choice.actions.openPosition.state === "available",
    ).length,
    backing: [...new Set(terms.map((term) => term.backingSymbol))],
    completeTerms: terms.length > 0 && terms.length === choices.length,
    gainRange: gains.length ? ([Math.min(...gains), Math.max(...gains)] as const) : null,
    waitRange: waits.length ? ([Math.min(...waits), Math.max(...waits)] as const) : null,
  };
}

/** A zero per-deposit limit is unlimited; a zero remaining capacity allows no deposit. */
export function maximumProtectionAmount(balance: bigint, perDepositLimit: bigint, capacity: bigint) {
  const limit = perDepositLimit > 0n && perDepositLimit < balance ? perDepositLimit : balance;
  return capacity < limit ? capacity : limit;
}
