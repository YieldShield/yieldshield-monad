import { describe, expect, it } from "vitest";
import { selectMarket } from "./market-selection";

const markets = [
  { id: "scenario-mon-usd", environment: "scenario" },
  { id: "shmon-usd", environment: "reference" },
  { id: "wmon-usd", environment: "reference" },
];
describe("market selection", () => {
  it("starts in the same Monad market regardless of API ordering", () => {
    expect(selectMarket(markets, null)?.id).toBe("wmon-usd");
    expect(selectMarket([...markets].reverse(), null)?.id).toBe("wmon-usd");
  });
  it("honors explicit reference and demo links", () => {
    expect(selectMarket(markets, "shmon-usd")?.id).toBe("shmon-usd");
    expect(selectMarket(markets, "scenario-mon-usd")?.environment).toBe("scenario");
  });
  it("never substitutes another market for an invalid explicit link", () => {
    expect(selectMarket(markets, "unknown")).toBeUndefined();
  });
  it("uses a working demo when the default reference pool cannot perform the action", () => {
    const unavailable = markets.map((market) => ({
      ...market,
      actions: { protect: market.environment === "scenario", provide: market.id === "shmon-usd" },
    }));
    expect(selectMarket(unavailable, null)?.id).toBe("scenario-mon-usd");
    expect(selectMarket(unavailable, null, "provide")?.id).toBe("shmon-usd");
    expect(selectMarket(unavailable, "wmon-usd")?.id).toBe("wmon-usd");
    expect(selectMarket(unavailable, "unknown")).toBeUndefined();
  });
  it("retains the preferred pool when actionable or when no alternative is actionable", () => {
    for (const ready of [true, false]) {
      const choices = markets.map((market) => ({ ...market, actions: { protect: ready } }));
      expect(selectMarket(choices, null)?.id).toBe("wmon-usd");
      expect(selectMarket([...choices].reverse(), null)?.id).toBe("wmon-usd");
    }
  });
  it("preserves an explicitly requested unavailable address", () => {
    const unavailable = {
      id: "wmon-usd",
      environment: "reference",
      address: "0x89Dc1d055Ac9ec50E1FA0a2d7da8be858F1B1470",
      actions: { protect: false },
    };
    const demo = { ...markets[0], actions: { protect: true } };
    expect(selectMarket([demo, unavailable], unavailable.address.toLowerCase())).toBe(unavailable);
  });
  it("opens a receipt's address link even after the pool receives a named registry ID", () => {
    const pool = { id: "wmon-ausd", environment: "reference", address: "0x89Dc1d055Ac9ec50E1FA0a2d7da8be858F1B1470" };
    const registered = [...markets, pool];
    expect(selectMarket(registered, pool.address)).toBe(pool);
    expect(selectMarket(registered, pool.address.toLowerCase())).toBe(pool);
    expect(selectMarket(registered, "0x0000000000000000000000000000000000000001")).toBeUndefined();
    expect(selectMarket(registered, pool.address.slice(0, -1))).toBeUndefined();
  });
  it("supports a scenario-only registry and an empty registry", () => {
    expect(
      selectMarket(
        markets.filter((m) => m.environment === "scenario"),
        null,
      )?.id,
    ).toBe("scenario-mon-usd");
    expect(selectMarket([], null)).toBeUndefined();
  });
});
