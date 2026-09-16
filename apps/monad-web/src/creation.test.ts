import { describe, it, expect } from "vitest";
import {
  creationVersion,
  creationFingerprint,
  assertCreationIdentity,
  creationInputs,
  validateCreationTerms,
  createPoolArgs,
} from "./creation";
import type { CreationOption, Registry } from "./types";
const version = {
  id: "reference-v1",
  environment: "reference",
  contract: "ReferenceFactory",
  factory: "0x1111111111111111111111111111111111111111",
  router: "BasePoolRouter",
  protectedAssets: ["wmon", "shmon"],
  backingAssets: ["test-usd"],
  available: true,
  reason: null,
  minimumUsd: "50000000000",
  backing: [{ id: "test-usd", available: true, bond: "500000000", minCollateralBps: "15000", reason: null }],
  collateralBps: "15000",
  juniorFeeBps: "1000",
  creatorFeeBps: "100",
  protocolFeeBps: "100",
  minimumPoolTime: 60,
  unlockDuration: 120,
  limits: {
    minCollateralBps: "10000",
    maxCollateralBps: "50000",
    minJuniorFeeBps: "100",
    maxJuniorFeeBps: "5000",
    minCreatorFeeBps: "0",
    maxCreatorFeeBps: "2000",
  },
} as CreationOption;
describe("creation review", () => {
  it("rejects incompatible pairs and does not silently substitute a token", () => {
    expect(creationVersion([version], "scenario-mon", "test-usd")).toBeUndefined();
    expect(creationVersion([version], "wmon", "mainnet-usdc")).toBeUndefined();
  });
  it("requires a fresh review after a changed bond or fee", () => {
    const current = creationFingerprint(version, "wmon", "test-usd");
    expect(creationFingerprint({ ...version, creatorFeeBps: "200" }, "wmon", "test-usd")).not.toBe(current);
    expect(
      creationFingerprint(
        { ...version, backing: [{ id: "test-usd", available: true, bond: "501000000", reason: null }] },
        "wmon",
        "test-usd",
      ),
    ).not.toBe(current);
  });
  it("rejects unapproved factory addresses and failed quotes", () => {
    const registry = {
      factories: [version],
      contracts: { ReferenceFactory: { address: version.factory } },
    } as unknown as Registry;
    expect(() => assertCreationIdentity(version, registry, "wmon", "test-usd")).not.toThrow();
    expect(() =>
      assertCreationIdentity(
        { ...version, factory: "0x2222222222222222222222222222222222222222" },
        registry,
        "wmon",
        "test-usd",
      ),
    ).toThrow();
    expect(() => creationFingerprint({ ...version, available: false }, "wmon", "test-usd")).toThrow();
  });
});

const defaults = { collateral: "150", junior: "10", creator: "1", bond: "500" };
describe("custom pool terms", () => {
  it("passes selected values to the contract in basis points and token units", () => {
    const { terms } = validateCreationTerms(version, "test-usd", 6, {
      collateral: "225.25",
      junior: "17.5",
      creator: "2.25",
      bond: "750.123456",
    });
    expect(terms).toEqual({ collateralBps: 22525n, juniorFeeBps: 1750n, creatorFeeBps: 225n, bond: 750123456n });
    const asset = { address: version.factory, symbol: "WMON" };
    expect(createPoolArgs(asset, { ...asset, symbol: "TestUSDC" }, terms!)).toEqual([
      asset.address,
      "WMON",
      asset.address,
      "TestUSDC",
      1750n,
      225n,
      22525n,
      750123456n,
    ]);
  });
  it.each([
    ["collateral", "149.99"],
    ["collateral", "500.01"],
    ["collateral", "150.001"],
    ["junior", "0.99"],
    ["junior", "50.01"],
    ["creator", "-1"],
    ["creator", "20.01"],
    ["bond", "499.999999"],
    ["bond", "500.0000001"],
    ["bond", ""],
    ["bond", "1e9"],
  ])("rejects invalid %s of %s", (field, value) => {
    const result = validateCreationTerms(version, "test-usd", 6, { ...defaults, [field]: value });
    expect(result.terms).toBeUndefined();
    expect(result.errors).toHaveProperty(field);
  });
  it("accepts boundary percentages, zero creator fees, and a waived bond", () => {
    const waived = {
      ...version,
      minimumUsd: "0",
      backing: [{ id: "test-usd", available: true, reason: null, bond: "0", minCollateralBps: "10000" }],
    };
    expect(
      validateCreationTerms(waived, "test-usd", 18, { collateral: "100", junior: "50", creator: "0", bond: "0" }).terms
        ?.bond,
    ).toBe(0n);
    expect(() => creationFingerprint(waived, "wmon", "test-usd")).not.toThrow();
    expect(
      validateCreationTerms(version, "test-usd", 6, { ...defaults, collateral: "500", creator: "20" }).terms,
    ).toBeDefined();
  });
  it("adjusts suggested collateral to the backing token minimum and preserves edits", () => {
    const higher = { ...version, backing: [{ ...version.backing[0], minCollateralBps: "20000" }] };
    expect(creationInputs(higher, "test-usd", 6, {}).collateral).toBe("200");
    expect(creationInputs(higher, "test-usd", 6, { junior: "12.5", bond: "750" })).toEqual({
      ...defaults,
      collateral: "200",
      junior: "12.5",
      bond: "750",
    });
  });
  it("invalidates review when selected terms or governance limits change", () => {
    const terms = validateCreationTerms(version, "test-usd", 6, defaults).terms!;
    const fingerprint = creationFingerprint(version, "wmon", "test-usd", terms);
    expect(creationFingerprint(version, "wmon", "test-usd", { ...terms, creatorFeeBps: 200n })).not.toBe(fingerprint);
    expect(
      creationFingerprint(
        { ...version, backing: [{ ...version.backing[0], minCollateralBps: "20000" }] },
        "wmon",
        "test-usd",
        terms,
      ),
    ).not.toBe(fingerprint);
    expect(
      validateCreationTerms({ ...version, limits: undefined } as unknown as CreationOption, "test-usd", 6, defaults)
        .terms,
    ).toBeUndefined();
  });
});
