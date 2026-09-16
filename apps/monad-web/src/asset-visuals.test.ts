import { describe, expect, it } from "vitest";
import deployment from "../../../config/deployment.json";
import { assetVisual } from "./asset-visuals";

describe("asset identity", () => {
  it("gives every deployed asset an image and a distinct label", () => {
    const images = deployment.assets.map((asset) => assetVisual(asset).image);
    expect(images).not.toContain("unknown.svg");
    expect(new Set(deployment.assets.map((asset) => assetVisual(asset).name)).size).toBe(deployment.assets.length);
  });
  it("recognizes checksummed addresses independently of display symbols", () => {
    const shmon = deployment.assets.find((a) => a.id === "shmon")!;
    expect(assetVisual({ address: shmon.address.toLowerCase(), symbol: "alias" }).image).toBe("shmonad.webp");
  });
  it("does not give an unknown token a known logo just because its symbol matches", () => {
    expect(assetVisual({ address: "0x0000000000000000000000000000000000000001", symbol: "shMON" }).image).toBe(
      "unknown.svg",
    );
    expect(assetVisual({ symbol: "WMON" }).image).toBe("unknown.svg");
  });
  it("handles native MON and missing metadata", () => {
    expect(assetVisual({ symbol: "MON" }).image).toBe("monad.png");
    expect(assetVisual().image).toBe("unknown.svg");
  });
});
