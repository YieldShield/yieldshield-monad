import type { Market, Snapshot } from "./types";

// Present one route per actual asset, preferring an actionable pool over an unavailable default.
export function landingMarkets(snapshot?: Pick<Snapshot, "chainId" | "contractsVerified" | "markets">): Market[] {
  if (!snapshot?.contractsVerified || snapshot.chainId !== 10143) return [];
  const ordered = [...snapshot.markets].sort(
    (a, b) =>
      Number(!!b.actions.protect) - Number(!!a.actions.protect) ||
      Number(b.backing.id === "test-usd") - Number(a.backing.id === "test-usd") ||
      a.id.localeCompare(b.id),
  );
  const seen = new Set<string>();
  const unique = ordered.filter((market) => {
    const address = market.shield.address.toLowerCase();
    if (seen.has(address)) return false;
    seen.add(address);
    return true;
  });
  const rank = (m: Market) =>
    m.shield.id === "wmon" ? 0 : m.shield.id === "shmon" ? 1 : m.environment === "reference" ? 2 : 3;
  return unique.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
