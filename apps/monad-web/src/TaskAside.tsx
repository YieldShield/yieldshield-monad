import type { ReactNode } from "react";
import { AssetPair } from "./AssetImage";
import type { VisualAsset } from "./asset-visuals";

export function TaskAside({
  title,
  asset,
  backing,
  children,
}: {
  title: string;
  asset?: VisualAsset;
  backing?: VisualAsset;
  children: ReactNode;
}) {
  return (
    <aside className="task-aside">
      <div className="task-aside-art" aria-hidden="true">
        <AssetPair asset={asset} backing={backing} />
      </div>
      <h2>{title}</h2>
      {children}
    </aside>
  );
}
