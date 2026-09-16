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
