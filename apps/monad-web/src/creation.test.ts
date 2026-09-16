import { describe, it, expect } from "vitest";
import { creationVersion, creationFingerprint, assertCreationIdentity } from "./creation";
import type { CreationOption, Registry } from "./types";
const version = {
  id: "reference-v1",
  contract: "ReferenceFactory",
  factory: "0x1111111111111111111111111111111111111111",
  router: "BasePoolRouter",
  protectedAssets: ["wmon", "shmon"],
  backingAssets: ["test-usd"],
  available: true,
  minimumUsd: "50000000000",
  backing: [{ id: "test-usd", available: true, bond: "500000000" }],
  collateralBps: "15000",
  juniorFeeBps: "1000",
  creatorFeeBps: "100",
  protocolFeeBps: "100",
  minimumPoolTime: 60,
  unlockDuration: 120,
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
