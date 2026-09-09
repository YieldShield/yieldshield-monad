/** Pure unit tests for the SDK money + PDA helpers (no validator needed). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { address } from "@solana/kit";
import {
  applyBps,
  factoryPda,
  fromBaseUnits,
  minReceived,
  positionMintPda,
  reservedFees,
  toBaseUnits,
} from "../src/index.js";

test("money helpers", () => {
  assert.equal(toBaseUnits("1.5", 6), 1_500_000n);
  assert.equal(fromBaseUnits(92_000_000n, 6), "92");
  assert.equal(minReceived(100_000_000n), 99_500_000n);
  assert.equal(minReceived(100_000_000n, 100), 99_000_000n);
  assert.equal(applyBps(100n, 1000), 10n);
  assert.equal(
    reservedFees({
      accumulatedCommissions: 5n,
      accumulatedPoolFee: 2n,
      accumulatedProtocolFee: 1n,
      currentEpochCommissionReserve: 0n,
      historicalCommissionReserve: 0n,
    }),
    8n,
  );
});

test("pda derivation is deterministic + matches the smoke client", async () => {
  assert.equal(await factoryPda(), await factoryPda());
  const pool = address("11111111111111111111111111111112");
  assert.equal(await positionMintPda(pool, 1), "nr8uUuE9DyBdiDKnPuouZwARcoeMiYb54uxijJqiqnD");
});
