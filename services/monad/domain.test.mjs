import { test } from "node:test";
import assert from "node:assert/strict";
import { address, validateRegistry, snapshotFresh, payoutPreview } from "./domain.mjs";
test("requires chain and address identity, never token symbol", () => {
  const a = { id: "mon", address: "0x" + "11".repeat(20), kind: "synthetic", decimals: 18 };
  assert.throws(() => validateRegistry({ chainId: 143, assets: [a], pools: [] }));
  assert.throws(() => address("WMON"));
  assert.equal(validateRegistry({ chainId: 10143, assets: [a], pools: [] }).assets[0], a);
});
test("rejects old and future snapshots", () => {
  assert(snapshotFresh({ chainId: 10143, observedAt: 9000 }, 10000));
  assert(!snapshotFresh({ chainId: 10143, observedAt: 11000 }, 10000));
  assert(!snapshotFresh({ chainId: 10143, observedAt: 1 }, 40000));
});
test("vault payout uses live denominator and never exceeds native share cap", () => {
  assert.equal(
    payoutPreview({ entryUsd: 100n * 10n ** 8n, backingPrice: 102000000n, backingDecimals: 6, cap: 150000000n }),
    98039215n,
  );
  assert.equal(
    payoutPreview({ entryUsd: 100n * 10n ** 8n, backingPrice: 50000000n, backingDecimals: 6, cap: 150000000n }),
    150000000n,
  );
  assert.throws(() => payoutPreview({ entryUsd: 1n, backingPrice: 0n, backingDecimals: 6, cap: 1n }));
});
