import { stockBrand } from "./stocks";

/** Display identity only. The alpha has no verified annual return metric. */
export type PoolGlyph = "usdc" | "jitosol" | "generic";
export type PoolPreset = {
  symbol: string;
  asset: string;
  source: string;
  protectedApy: null;
  premiumApy: null;
  glyph: PoolGlyph;
};
export const POOL_PRESETS: readonly PoolPreset[] = [];
export function presetFor(symbol: string, assetName?: string): PoolPreset {
  const name = stockBrand(symbol)?.name ?? (symbol === "TestUSDC" ? "Test USDC" : undefined);
  return {
    symbol,
    asset: name || assetName || symbol || "Test asset",
    source: `${symbol} · Base Sepolia test token`,
    protectedApy: null,
    premiumApy: null,
    glyph: /USDC|USDG|USD/i.test(symbol) ? "usdc" : "generic",
  };
}
/** Registry overrides can change identity, but cannot introduce unsupported yield claims. */
export function presetForPool(symbol: string, token?: string, assetName?: string): PoolPreset {
  const base = presetFor(symbol, assetName);
  try {
    const registry = JSON.parse(import.meta.env.VITE_POOL_REGISTRY_JSON || "{}");
    const item = token ? registry[token] : undefined;
    return { ...base, asset: typeof item?.asset === "string" ? item.asset : base.asset };
  } catch {
    return base;
  }
}
