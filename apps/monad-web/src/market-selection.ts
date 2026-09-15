export function selectMarket<T extends { id: string; environment: string }>(markets: T[], requested: string | null) {
  if (requested) return markets.find((market) => market.id === requested);
  return (
    markets.find((market) => market.id === "wmon-usd") ||
    markets.find((market) => market.environment === "reference") ||
    markets[0]
  );
}
