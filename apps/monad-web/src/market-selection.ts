export function selectMarket<T extends { id: string; environment: string; address?: string }>(
  markets: T[],
  requested: string | null,
) {
  if (requested) {
    const address = /^0x[0-9a-f]{40}$/i.test(requested) ? requested.toLowerCase() : null;
    return markets.find(
      (market) => market.id === requested || (address !== null && market.address?.toLowerCase() === address),
    );
  }
  return (
    markets.find((market) => market.id === "wmon-usd") ||
    markets.find((market) => market.environment === "reference") ||
    markets[0]
  );
}
