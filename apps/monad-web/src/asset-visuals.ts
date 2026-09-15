import deployment from "../../../config/deployment.json";

export type VisualAsset = { address?: string; symbol?: string; name?: string };
type AssetVisual = { name: string; image: string; theme: string };
const visuals: Record<string, AssetVisual> = {
  wmon: { name: "Wrapped MON", image: "monad.png", theme: "monad" },
  shmon: { name: "Staked MON", image: "shmonad.webp", theme: "staking" },
  "test-usd": { name: "Test dollars", image: "test-usd.svg", theme: "test-usd" },
  "test-usd-vault": { name: "Test vault shares", image: "test-vault.svg", theme: "vault" },
  "scenario-mon": { name: "Demo MON", image: "scenario.svg", theme: "scenario" },
};
const byAddress = new Map(deployment.assets.map((asset) => [asset.address.toLowerCase(), visuals[asset.id]]));

export function assetVisual(asset?: VisualAsset): AssetVisual {
  if (asset?.address) {
    const known = byAddress.get(asset.address.toLowerCase());
    if (known) return known;
  } else if (asset?.symbol === "MON") {
    return { name: "Monad", image: "monad.png", theme: "monad" };
  }
  return { name: asset?.name || asset?.symbol || "Unknown asset", image: "unknown.svg", theme: "unknown" };
}
