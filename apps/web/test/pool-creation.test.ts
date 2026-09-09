import { describe, expect, it } from "vitest";
import type { PoolCreationOptions } from "@yieldshield/core";
import { reviewPoolCreation, type PoolCreationForm } from "../src/lib/pool-creation";

const asset = {
  token: "0x1111111111111111111111111111111111111111",
  symbol: "tWETH",
  name: "Test WETH",
  decimals: 18,
  minCollateralRatioBp: 15000n,
  tranche: "volatile" as const,
};
const backing = {
  token: "0x2222222222222222222222222222222222222222",
  symbol: "vUSDC",
  name: "Vault USDC",
  decimals: 18,
  minCollateralRatioBp: 12000n,
  tranche: "stable" as const,
  minimumBondAmount: 500000000000000000n,
};
const options: PoolCreationOptions = {
  chainId: 84532,
  factory: "0x3333333333333333333333333333333333333333",
  protectedAssets: [asset],
  backingAssets: [backing],
  minimumBondUsd: 50000000n,
  bounds: {
    commissionMinBp: 100,
    commissionMaxBp: 5000,
    poolFeeMinBp: 0,
    poolFeeMaxBp: 2000,
    collateralMinBp: 10000,
    collateralMaxBp: 50000,
  },
  fixed: {
    protocolFeeBp: 100,
    maxTvlUsd: 1000000000000000n,
    minimumPoolTime: 60,
    unlockDuration: 120,
    shieldTransferLock: 86400,
    protectorTransferLock: 2419200,
  },
  activePools: 13,
  maxActivePools: 100,
  evaluatedAt: 1000,
  validUntil: 1060,
};
const form: PoolCreationForm = {
  commissionPct: "7.25",
  poolFeePct: "2.35",
  collateralPct: "165.75",
  bond: "0.500000000000000001",
};
const review = (values = form, settings = options, now = 1030) =>
  reviewPoolCreation(values, asset.token, backing.token, settings, now);

describe("reviewed pool creation terms", () => {
  it("preserves custom fees and native-token bond precision without floating-point rounding", () => {
    const result = review();
    expect(result.error).toBeNull();
    expect(result.params).toEqual({
      shieldedToken: asset.token,
      backingToken: backing.token,
      commissionRateBp: 725,
      poolFeeBp: 235,
      collateralRatioBp: 16575,
      creationBondAmount: 500000000000000001n,
      ...options.fixed,
    });
  });

  it.each(["", ".", "-1", "NaN", "Infinity", "1e2", "1.001"])(
    "rejects malformed or over-precise fee %s",
    (commissionPct) => {
      expect(review({ ...form, commissionPct }).params).toBeNull();
    },
  );

  it("applies factory bounds, including the 1% minimum junior share and backing whitelist floor", () => {
    for (const partial of [
      { commissionPct: "0.99" },
      { commissionPct: "50.01" },
      { poolFeePct: "20.01" },
      { collateralPct: "119.99" },
      { collateralPct: "500.01" },
    ])
      expect(review({ ...form, ...partial }).params).toBeNull();
    expect(review({ ...form, collateralPct: "120", commissionPct: "1", poolFeePct: "0" }).error).toBeNull();
    expect(review({ ...form, collateralPct: "500", commissionPct: "50", poolFeePct: "20" }).error).toBeNull();
  });

  it("checks the backing-token bond minimum and precision", () => {
    expect(review({ ...form, bond: "0.499999999999999999" }).params).toBeNull();
    expect(review({ ...form, bond: "0.5000000000000000001" }).params).toBeNull();
    expect(review({ ...form, bond: "0.5" }).params?.creationBondAmount).toBe(backing.minimumBondAmount);
    const sixDecimals = {
      ...options,
      backingAssets: [{ ...backing, decimals: 6, minimumBondAmount: 500000n }],
    };
    expect(review({ ...form, bond: "0.500001" }, sixDecimals).params?.creationBondAmount).toBe(500001n);
  });

  it("fails closed for expired settings, unavailable capacity and unsupported asset roles", () => {
    expect(review(form, options, 999).params).toBeNull();
    expect(review(form, options, 1060).params).toBeNull();
    expect(review(form, { ...options, activePools: 100 }).params).toBeNull();
    expect(reviewPoolCreation(form, backing.token, asset.token, options, 1030).params).toBeNull();
    expect(reviewPoolCreation(form, asset.token, backing.token, undefined, 1030).params).toBeNull();
  });

  it("uses the verified factory defaults rather than treating demo timing or protocol fees as universal", () => {
    const updated = {
      ...options,
      fixed: { ...options.fixed, protocolFeeBp: 150, minimumPoolTime: 90, unlockDuration: 300 },
    };
    expect(review(form, updated).params).toMatchObject({
      protocolFeeBp: 150,
      minimumPoolTime: 90,
      unlockDuration: 300,
    });
  });
});
