import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketSelect } from "./MarketSelect";
import type { Market, Snapshot } from "./types";

const base = {
  id: "standard",
  address: "0x1111111111111111111111111111111111111111",
  symbol: "WMON",
  backingSymbol: "TestUSDC",
  shield: { id: "wmon", symbol: "WMON", address: "0x3333333333333333333333333333333333333333" },
  backing: { id: "test-usd", symbol: "TestUSDC", address: "0x4444444444444444444444444444444444444444" },
  environment: "reference",
  ready: true,
  collateralBps: "15000",
  juniorFeeBps: "1000",
  creatorFeeBps: "100",
  protocolFeeBps: "100",
} as Market;

describe("pool selection with custom terms", () => {
  it("distinguishes pools with the same pair by terms and contract address", () => {
    const custom = {
      ...base,
      id: "custom",
      address: "0x2222222222222222222222222222222222222222",
      collateralBps: "22525",
      juniorFeeBps: "1750",
      creatorFeeBps: "225",
    } as Market;
    const html = renderToStaticMarkup(
      <MarketSelect data={{ markets: [base, custom] } as Snapshot} id="custom" setId={() => {}} />,
    );
    expect(html).toContain("225.25%");
    expect(html).toContain("20.75%");
    expect(html).toContain("12%");
    expect(html).toContain("0x1111…1111");
    expect(html).toContain("0x2222…2222");
  });
  it("does not show default terms for unavailable pool data", () => {
    const unavailable = { ...base, collateralBps: undefined, juniorFeeBps: undefined, ready: false };
    const html = renderToStaticMarkup(
      <MarketSelect data={{ markets: [unavailable] } as Snapshot} id="standard" setId={() => {}} />,
    );
    expect(html).not.toContain("150%");
    expect(html).not.toContain("12%");
    expect(html).toContain("Unavailable");
  });
});
