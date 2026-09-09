import type { AccountId, TokenId } from "@yieldshield/core";

/**
 * SWR cache keys. Keys are arrays (stable, parameterized) whose first element names the dataset, so
 * {@link useRefreshAll} can invalidate "our" keys with a simple predicate. A `null` key tells SWR not
 * to fetch (used when the wallet is disconnected or a param is missing).
 */
export const poolsKey = () => ["pools"] as const;
export const whitelistKey = () => ["whitelist"] as const;
export const positionsKey = (owner: AccountId | null) => (owner ? (["positions", owner] as const) : null);
export const balanceKey = (owner: AccountId | null, token?: TokenId) =>
  owner && token ? (["balance", owner, token] as const) : null;
export const activityKey = (owner: AccountId | null) => (owner ? (["activity", owner] as const) : null);

/** First-element names of all app-owned SWR keys (used for targeted invalidation). */
export const DATA_KEY_NAMES = new Set([
  "pools",
  "pool-creation",
  "whitelist",
  "positions",
  "balance",
  "activity",
  "wl-balances",
  "protected-exit-quote",
]);
