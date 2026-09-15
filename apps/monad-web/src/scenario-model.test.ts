import { describe, expect, it } from "vitest";
import { scenarioExits } from "./scenario-model";

describe("illustrative backing exit accounting", () => {
  it("keeps creator/protocol fees out of the collective provider payout", () => {
    const result = scenarioExits(25, 2);
    expect(result.assetExit).toBe(122);
    expect(result.payout).toBe(100);
    expect(result.junior).toBe(177.5);
    expect(result.outsideFees).toBe(0.5);
    expect(result.shares * result.sharePrice).toBeCloseTo(100);
  });
  it("does not charge gain fees after a loss", () => {
    const result = scenarioExits(-20, 0);
    expect(result.assetExit).toBe(80);
    expect(result.junior).toBe(130);
    expect(result.fee).toBe(0);
    expect(result.outsideFees).toBe(0);
  });
  it.each([
    [-80, 0, 170],
    [0, 2, 253],
    [25, 2, 278],
    [80, 0, 330],
  ])(
    "conserves the combined asset/backing value at %s%% asset and %s%% backing change",
    (change, backingYield, combinedValue) => {
      const result = scenarioExits(change, backingYield);
      expect(result.payout + result.junior + result.outsideFees).toBeCloseTo(combinedValue);
    },
  );
});
