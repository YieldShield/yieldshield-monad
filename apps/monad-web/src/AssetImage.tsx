import { useState } from "react";
import { assetVisual, type VisualAsset } from "./asset-visuals";

export function TokenIcon({ asset }: { asset?: VisualAsset }) {
  const visual = assetVisual(asset);
  const [failedImage, setFailedImage] = useState<string>();
  return (
    <span className={`token-icon asset-image ${visual.theme}`} aria-hidden="true">
      <img
        src={`/assets/tokens/${failedImage === visual.image ? "unknown.svg" : visual.image}`}
        alt=""
        width="48"
        height="48"
        decoding="async"
        onError={() => setFailedImage(visual.image)}
      />
    </span>
  );
}

export function AssetPair({ asset, backing }: { asset?: VisualAsset; backing?: VisualAsset }) {
  return (
    <span className="asset-pair" aria-hidden="true">
      <TokenIcon asset={asset} />
      <TokenIcon asset={backing} />
    </span>
  );
}
