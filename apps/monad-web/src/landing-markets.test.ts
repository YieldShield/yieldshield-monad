import { describe, expect, it } from "vitest";
import { landingMarkets } from "./landing-markets";
import type { Market } from "./types";
const market = (id: string, address: string, shieldId: string, backing = "test-usd", available = true) =>
  ({
    id,
    environment: shieldId === "scenario-mon" ? "scenario" : "reference",
    shield: { address, id: shieldId },
    backing: { id: backing },
    actions: { protect: available },
  }) as unknown as Market;
const snapshot = (markets: Market[]) => ({ chainId: 10143, contractsVerified: true, markets });
describe("landing asset routes", () => {
  it("keeps the familiar order and routes to a usable backing pool", () => {
    const pools = [
      market("demo", "0xcc", "scenario-mon"),
      market("wmon-usd", "0xaa", "wmon", "test-usd", false),
      market("shmon", "0xbb", "shmon"),
      market("wmon-vault", "0xAA", "wmon", "test-usd-vault"),
    ];
    expect(landingMarkets(snapshot(pools)).map((m) => m.id)).toEqual(["wmon-vault", "shmon", "demo"]);
    expect(landingMarkets(snapshot([...pools].reverse())).map((m) => m.id)).toEqual(["wmon-vault", "shmon", "demo"]);
  });
  it("prefers ordinary backing when both pools are actionable", () => {
    expect(
      landingMarkets(
        snapshot([market("a-vault", "0xaa", "wmon", "test-usd-vault"), market("z-usd", "0xaa", "wmon")]),
      )[0].id,
    ).toBe("z-usd");
  });
  it("does not merge distinct assets by their names or omit discovered pools", () => {
    const pools = [market("known", "0xaa", "wmon"), market("discovered", "0xbb", "wmon")];
    expect(landingMarkets(snapshot(pools))).toHaveLength(2);
  });
  it("keeps unavailable assets discoverable without claiming that protection is ready", () => {
    const pools = [market("unavailable", "0xaa", "wmon", "test-usd", false)];
    expect(landingMarkets(snapshot(pools))[0].actions.protect).toBe(false);
  });
  it("does not present unverified or wrong-chain asset routes", () => {
    const data = snapshot([market("wmon-usd", "0xaa", "wmon")]);
    expect(landingMarkets()).toEqual([]);
    expect(landingMarkets({ ...data, chainId: 1 })).toEqual([]);
    expect(landingMarkets({ ...data, contractsVerified: false })).toEqual([]);
  });
});
