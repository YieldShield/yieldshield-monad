import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityHistory, type ActivitySnapshot } from "./Activity";

const snapshot: ActivitySnapshot = {
  chainId: 10143,
  source: "Envio HyperSync",
  status: "ready",
  complete: true,
  observedAt: 1720000010000,
  indexedThrough: 62440000,
  poolCount: 7,
  hasMore: false,
  events: [
    {
      id: "tx:1",
      kind: "protected",
      poolLabel: "WMON / AUSD",
      environment: "reference",
      actor: "0x1111111111111111111111111111111111111111",
      asset: { address: "0x2222222222222222222222222222222222222222", symbol: "WMON", decimals: 18 },
      amount: "1200000000000000000",
      receiptId: "0",
      transactionHash: "0x" + "aa".repeat(32),
      timestamp: 1720000000,
    },
  ],
};

describe("indexed activity presentation", () => {
  it("shows actual amounts and a transaction link without promising current ownership", () => {
    const html = renderToStaticMarkup(<ActivityHistory data={snapshot} />);
    expect(html).toContain("Protection opened");
    expect(html).toContain("1.20000 WMON");
    expect(html).toContain(`https://testnet.monadexplorer.com/tx/${snapshot.events[0].transactionHash}`);
    expect(html).toContain("7 deployment pools");
    expect(html).not.toContain("Your balance");
  });
  it("labels a partial withdrawal without implying the remaining position was closed", () => {
    const html = renderToStaticMarkup(
      <ActivityHistory
        data={{ ...snapshot, events: [{ ...snapshot.events[0], kind: "asset-partially-withdrawn" }] }}
      />,
    );
    expect(html).toContain("Asset partially withdrawn");
    expect(html).toContain("1.20000 WMON");
    expect(html).toContain('aria-label="View asset partially withdrawn transaction"');
  });
  it("distinguishes missing data and provider failure from a genuinely empty history", () => {
    expect(renderToStaticMarkup(<ActivityHistory />)).toContain("Loading onchain activity");
    for (const status of ["not-configured", "unavailable"] as const) {
      const html = renderToStaticMarkup(<ActivityHistory data={{ ...snapshot, status, events: [] }} />);
      expect(html).toContain("temporarily unavailable");
      expect(html).not.toContain("No activity");
    }
    expect(renderToStaticMarkup(<ActivityHistory data={{ ...snapshot, events: [] }} personal />)).toContain(
      "No activity for this wallet in the indexed pools",
    );
  });
  it("labels retained results as delayed after provider failure or stale refresh", () => {
    const html = renderToStaticMarkup(<ActivityHistory data={{ ...snapshot, status: "stale", complete: false }} />);
    expect(html).toContain("Updates are delayed");
    expect(html).toContain("Protection opened");
    expect(html).not.toContain("No activity");
  });
  it("rejects foreign-chain results", () => {
    const html = renderToStaticMarkup(<ActivityHistory data={{ ...snapshot, chainId: 143 }} />);
    expect(html).toContain("temporarily unavailable");
    expect(html).not.toContain("Protection opened");
  });
  it("isolates invalid activity timestamps without crashing the surrounding page", () => {
    for (const timestamp of [Number.MAX_SAFE_INTEGER, 8640000000001, -1, NaN, 1.5]) {
      const html = renderToStaticMarkup(
        <main>
          <h1>Your positions</h1>
          <ActivityHistory data={{ ...snapshot, events: [{ ...snapshot.events[0], timestamp }] }} />
        </main>,
      );
      expect(html).toContain("Your positions");
      expect(html).toContain("temporarily unavailable");
      expect(html).not.toContain("Protection opened");
      expect(html).not.toContain("No activity");
    }
  });
  it("identifies synthetic activity and does not invent a cancellation amount", () => {
    const html = renderToStaticMarkup(
      <ActivityHistory
        data={{
          ...snapshot,
          events: [
            { ...snapshot.events[0], kind: "notice-cancelled", environment: "scenario", asset: null, amount: null },
          ],
        }}
      />,
    );
    expect(html).toContain("Withdrawal cancelled");
    expect(html).toContain("Demo");
    expect(html).not.toContain("1.20000");
  });
});
