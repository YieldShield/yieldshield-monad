export function selectMarket<
  T extends { id: string; environment: string; address?: string; actions?: Record<string, boolean> },
>(markets: T[], requested: string | null, action: "protect" | "provide" = "protect") {
  if (requested) {
    const address = /^0x[0-9a-f]{40}$/i.test(requested) ? requested.toLowerCase() : null;
    return markets.find(
      (market) => market.id === requested || (address !== null && market.address?.toLowerCase() === address),
    );
  }
  const preferred =
    markets.find((market) => market.id === "wmon-usd") ||
    markets.find((market) => market.environment === "reference") ||
    markets[0];
  return preferred?.actions?.[action] ? preferred : markets.find((market) => market.actions?.[action]) || preferred;
}
