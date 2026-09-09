import { describe, expect, it } from "vitest";
import { countdown, parseProtectionStatus, statusIsFresh } from "../src/lib/protection-status";
import capturedStatus from "./fixtures/base-custom-pool-status.json";
function fixture() {
  const action = { state: "blocked", blockers: [{ code: "pool-missing", message: "Pool being prepared" }] };
  return {
    schemaVersion: 1,
    chainId: 84532,
    sourceChainId: 8453,
    evaluatedAt: 100,
    validUntil: 120,
    deployment: {
      steps: [],
      verified: false,
      contractsConfirmed: 0,
      transactionsConfirmed: 0,
      poolsReady: 0,
      totalPools: 4,
    },
    session: { state: "closed", opensAt: null, closesAt: null, nextOpenAt: null, checkedThrough: null },
    faucet: { tokens: [], verified: false, configured: false, ready: false, address: null },
    assets: ["AAPLc", "NVDAc", "METAc", "GOOGLc"].map((sourceSymbol) => ({
      sourceSymbol,
      symbol: `t${sourceSymbol}`,
      pool: { state: "missing" },
      sourcePrice: null,
      actions: {
        openPosition: action,
        withdrawStock: action,
        protectedExit: action,
        provideCollateral: action,
        withdrawCollateral: action,
      },
    })),
  };
}
describe("protection availability", () => {
  it("expires cached availability even without another network response", () => {
    expect(statusIsFresh({ evaluatedAt: 100, validUntil: 120 }, 119)).toBe(true);
    expect(statusIsFresh({ evaluatedAt: 100, validUntil: 120 }, 120)).toBe(false);
    expect(statusIsFresh({ evaluatedAt: 100, validUntil: 999 }, 110)).toBe(false);
    expect(statusIsFresh({ evaluatedAt: 140, validUntil: 160 }, 110)).toBe(false);
  });
  it("rejects wrong-chain, duplicate-stock and contradictory action data", () => {
    expect(parseProtectionStatus(fixture(), 110).chainId).toBe(84532);
    const wrong = fixture();
    wrong.chainId = 8453;
    expect(() => parseProtectionStatus(wrong, 110)).toThrow();
    const duplicate = fixture();
    duplicate.assets[1] = duplicate.assets[0]!;
    expect(() => parseProtectionStatus(duplicate, 110)).toThrow();
    const conflict = fixture();
    conflict.assets[0]!.actions.openPosition.state = "available";
    expect(() => parseProtectionStatus(conflict, 110)).toThrow();
  });
  it("rejects malformed faucet metadata before rendering balances", () => {
    for (const override of [
      { address: 12 },
      { address: "not-an-address" },
      { verified: "true" },
      { tokens: [{ address: "bad", dripAmountBaseUnits: "oops" }] },
    ])
      expect(() =>
        parseProtectionStatus({ ...fixture(), faucet: { ...fixture().faucet, ...override } }, 110),
      ).toThrow();
  });
  it("never treats a finished countdown as permission to transact", () => {
    expect(countdown(100, 101)).toBe("Checking current session…");
    expect(countdown(4700, 1100)).toBe("1h 0m");
  });
});

function demoFixture() {
  const legacy = fixture();
  return {
    ...legacy,
    schemaVersion: 2,
    sourceChainId: null,
    source: null,
    policy: { kind: "continuous-demo", priceSource: "deterministic-onchain-demo" },
    session: { ...legacy.session, state: "continuous" },
    deployment: { ...legacy.deployment, verified: true },
    assets: legacy.assets.map((asset) => ({
      ...asset,
      relay: null,
      executionPrice: { kind: "deterministic-demo", priceUsd: 100, evaluatedAt: 100, marketObservation: false },
      actions: { ...asset.actions, openPosition: { state: "available", blockers: [] } },
    })),
  };
}
describe("continuous demo policy provenance", () => {
  it("parses the actual fourteen-pool API response including original stock identities", () => {
    const parsed = parseProtectionStatus(capturedStatus, capturedStatus.evaluatedAt + 1);
    expect(parsed.assets).toHaveLength(14);
    expect(parsed.assets.every((asset) => !!asset.pool.address)).toBe(true);
    const missing = structuredClone(capturedStatus);
    Reflect.deleteProperty(missing.assets[0]!.pool, "address");
    expect(() => parseProtectionStatus(missing, missing.evaluatedAt + 1)).toThrow(/identity/);
  });
  it("distinguishes thirteen pool identities when assets have two collateral choices", () => {
    const f = demoFixture();
    const pairs = [
      "AAPLc:TestUSDC",
      "NVDAc:TestUSDC",
      "METAc:TestUSDC",
      "GOOGLc:TestUSDC",
      "WETH:TestUSDC",
      "cbBTC:TestUSDC",
      "vWETH:TestUSDC",
      "WETH:vUSDC",
      "cbBTC:vUSDC",
      "AAPLc:vUSDC",
      "NVDAc:vUSDC",
      "METAc:vUSDC",
      "GOOGLc:vUSDC",
    ];
    const assets = pairs.map((pair, i) => {
      const [sourceSymbol, backingSymbol] = pair.split(":");
      return {
        ...f.assets[0]!,
        sourceSymbol,
        symbol: sourceSymbol!.startsWith("v") ? sourceSymbol : `t${sourceSymbol}`,
        pool: { address: `0x${(i + 1).toString(16).padStart(40, "0")}`, state: "ready", terms: { backingSymbol } },
      };
    });
    const extended = { ...f, deployment: { ...f.deployment, totalPools: 13 }, assets };
    expect(parseProtectionStatus(extended, 110).assets).toHaveLength(13);
    const custom = { ...assets[4]!, pool: { ...assets[4]!.pool, address: `0x${"f".repeat(40)}` } };
    expect(
      parseProtectionStatus(
        { ...extended, deployment: { ...extended.deployment, totalPools: 14 }, assets: [...assets, custom] },
        110,
      ).assets,
    ).toHaveLength(14);
    expect(() =>
      parseProtectionStatus(
        { ...extended, deployment: { ...extended.deployment, totalPools: 14 }, assets: [...assets, assets[4]] },
        110,
      ),
    ).toThrow(/identity/);
    const duplicate = { ...extended, assets: [...assets.slice(0, -1), assets[0]] };
    expect(() => parseProtectionStatus(duplicate, 110)).toThrow();
    expect(() => parseProtectionStatus({ ...extended, assets: assets.slice(0, -1) }, 110)).toThrow();
  });
  it("accepts a verified continuous deployment without a calendar or source feed", () => {
    expect(parseProtectionStatus(demoFixture(), 110).session.state).toBe("continuous");
  });
  it("rejects a continuous flag added to the legacy policy", () => {
    const f = fixture();
    f.session.state = "continuous";
    expect(() => parseProtectionStatus(f, 110)).toThrow();
  });
  it("rejects real-source claims or an unknown synthetic policy", () => {
    const f = demoFixture();
    expect(() => parseProtectionStatus({ ...f, sourceChainId: 8453 }, 110)).toThrow();
    expect(() => parseProtectionStatus({ ...f, source: { blockNumber: "1" } }, 110)).toThrow();
    expect(() => parseProtectionStatus({ ...f, policy: { ...f.policy, kind: "other" } }, 110)).toThrow();
  });
  it("rejects simulated values labelled as market observations", () => {
    const f = demoFixture();
    f.assets[0]!.executionPrice.marketObservation = true;
    expect(() => parseProtectionStatus(f, 110)).toThrow();
  });
  it("requires pricing and verified deployment evidence for an available action", () => {
    const f = demoFixture();
    f.deployment.verified = false;
    expect(() => parseProtectionStatus(f, 110)).toThrow();
    const missing = demoFixture();
    Reflect.deleteProperty(missing.assets[0]!, "executionPrice");
    expect(() => parseProtectionStatus(missing, 110)).toThrow();
  });
});
