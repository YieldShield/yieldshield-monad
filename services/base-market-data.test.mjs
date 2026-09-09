import test from "node:test";
import assert from "node:assert/strict";
import {
  readSourceSnapshot,
  publicSnapshot,
  STOCKS,
  USDC,
  SOURCE_REGISTRY,
  SOURCE_SEQUENCER,
  MAX_SOURCE_BLOCK_AGE_SECONDS,
} from "./base-market-data.mjs";

const NOW = 1_788_826_800n;
const HASH = `0x${"ab".repeat(32)}`;

function fixture() {
  const state = {
    chainId: 8453,
    tip: 5002n,
    block: { number: 5000n, hash: HASH, timestamp: NOW - 4n },
    clockMs: Number(NOW) * 1000,
    calls: [],
    results: [[1n, 0n, NOW - 8000n, NOW - 1000n, 1n]],
  };
  for (const [index, asset] of [...STOCKS, USDC].entries()) {
    const roundId = BigInt(index + 10);
    state.results.push([roundId, asset === USDC ? 1_00000000n : 200_00000000n, NOW - 65n, NOW - 60n, roundId], 8);
    if (asset !== USDC) state.results.push([1_000000000000000000n, false]);
  }
  const client = {
    async getChainId() {
      state.calls.push(["chain"]);
      return state.chainId;
    },
    async getBlockNumber(options) {
      state.calls.push(["tip", options]);
      return state.tip;
    },
    async getBlock(options) {
      state.calls.push(["block", options]);
      return state.block;
    },
    async multicall(options) {
      state.calls.push(["multicall", options]);
      if (state.error) throw state.error;
      if (state.afterRead) state.afterRead();
      return state.results;
    },
  };
  const options = { now: () => state.clockMs };
  return { state, client, options, read: () => readSourceSnapshot(client, options) };
}

function setPriceAge(state, age, index = 1) {
  state.results[index][2] = NOW - BigInt(age);
  state.results[index][3] = NOW - BigInt(age);
}

test("reads every identity at one pinned Base block and preserves complete source rounds", async () => {
  const { state, read } = fixture();
  const snapshot = await read();
  assert.equal(snapshot.chainId, 8453);
  assert.equal(snapshot.blockNumber, 5000n);
  assert.equal(snapshot.blockHash, HASH);
  assert.equal(snapshot.blockTimestamp, NOW - 4n);
  assert.deepEqual(state.calls[1], ["tip", { cacheTime: 0 }]);
  assert.deepEqual(state.calls[2], ["block", { blockNumber: 5000n }]);
  const options = state.calls.find(([name]) => name === "multicall")[1];
  assert.equal(options.blockNumber, snapshot.blockNumber);
  assert.equal(options.allowFailure, false);
  assert.equal(options.contracts[0].address, SOURCE_SEQUENCER);
  const registryCalls = options.contracts.filter((call) => call.functionName === "getOracleParams");
  assert.deepEqual(
    registryCalls.map((call) => call.args[0]),
    STOCKS.map((stock) => stock.token),
  );
  assert.ok(registryCalls.every((call) => call.address === SOURCE_REGISTRY));
  assert.ok(!registryCalls.some((call) => call.args.includes(USDC.token)));
  assert.deepEqual(
    options.contracts.filter((call) => call.functionName === "decimals").map((call) => call.address),
    [...STOCKS, USDC].map((asset) => asset.feed),
  );
  assert.deepEqual(snapshot.assets[0].round, state.results[1]);
  assert.deepEqual(snapshot.assets[0].observation, {
    roundId: 10n,
    answer: 200_00000000n,
    startedAt: NOW - 65n,
    updatedAt: NOW - 60n,
    answeredInRound: 10n,
    multiplier: 1_000000000000000000n,
    oraclePaused: false,
    sequencerAnswer: 0n,
    sequencerStartedAt: NOW - 8000n,
    sourceBlockNumber: 5000n,
    sourceBlockTimestamp: NOW - 4n,
  });
});

test("rejects a wrong source chain before requesting block or feed data", async () => {
  const { state, read } = fixture();
  state.chainId = 84532;
  await assert.rejects(read, /Base mainnet/);
  assert.deepEqual(state.calls, [["chain"]]);
});

test("rejects invalid chain tips without underflowing the confirmation offset", async (t) => {
  for (const tip of [0n, 1n, 2n, -1n, 5002, 1n << 80n]) {
    await t.test(String(tip), async () => {
      const { state, read } = fixture();
      state.tip = tip;
      await assert.rejects(read, /Invalid source chain tip/);
    });
  }
});

test("rejects stale and future source blocks instead of retimestamping them", async (t) => {
  for (const timestamp of [NOW - 121n, NOW + 1n]) {
    await t.test(String(timestamp), async () => {
      const { state, read } = fixture();
      state.block.timestamp = timestamp;
      await assert.rejects(read, /Source block stale or future/);
      assert.equal(state.calls.filter(([name]) => name === "multicall").length, 0);
    });
  }
});

test("rejects a block-number mismatch and missing block hash", async (t) => {
  await t.test("block mismatch", async () => {
    const { state, read } = fixture();
    state.block.number += 1n;
    await assert.rejects(read, /different block/);
  });
  await t.test("missing hash", async () => {
    const { state, read } = fixture();
    delete state.block.hash;
    await assert.rejects(read, /Invalid source block identity/);
  });
});

test("slow source requests cannot revive an observation which expired during the request", async () => {
  const { state, read } = fixture();
  state.afterRead = () => {
    state.clockMs = Number(NOW + 121n) * 1000;
  };
  await assert.rejects(read, /Source block stale or future/);
});

test("source RPC errors fail closed without a partial snapshot or substitute price", async () => {
  const { state, read } = fixture();
  state.error = new Error("registry unavailable");
  await assert.rejects(read, /registry unavailable/);
});

test("truncated multicall results are rejected", async () => {
  const { state, read } = fixture();
  state.results.pop();
  await assert.rejects(read, /Incomplete source multicall/);
});

test("feed decimals must be exactly the verified eight-decimal denomination", async () => {
  const { state, read } = fixture();
  state.results[2] = 18;
  await assert.rejects(read, /source decimals/);
});

test("malformed equity rounds are rejected", async (t) => {
  const cases = [
    [
      "zero round",
      (round) => {
        round[0] = 0n;
      },
    ],
    [
      "oversized round",
      (round) => {
        round[0] = 1n << 80n;
        round[4] = round[0];
      },
    ],
    [
      "zero price",
      (round) => {
        round[1] = 0n;
      },
    ],
    [
      "negative price",
      (round) => {
        round[1] = -1n;
      },
    ],
    [
      "price exceeds int256",
      (round) => {
        round[1] = 1n << 255n;
      },
    ],
    [
      "uninitialized start",
      (round) => {
        round[2] = 0n;
      },
    ],
    [
      "future price",
      (round) => {
        round[3] = NOW + 1n;
      },
    ],
    [
      "update earlier than start",
      (round) => {
        round[3] = round[2] - 1n;
      },
    ],
    [
      "incomplete round",
      (round) => {
        round[4] = round[0] - 1n;
      },
    ],
    [
      "wrong decoded type",
      (round) => {
        round[0] = 10;
      },
    ],
    [
      "wrong tuple length",
      (round) => {
        round.push(0n);
      },
    ],
  ];
  for (const [label, change] of cases) {
    await t.test(label, async () => {
      const { state, read } = fixture();
      change(state.results[1]);
      await assert.rejects(read, /Invalid AAPLc source observation/);
    });
  }
});

test("registry results require nonzero uint128 multiplier and a canonical boolean", async (t) => {
  for (const [label, params] of [
    ["zero multiplier", [0n, false]],
    ["negative multiplier", [-1n, false]],
    ["overflow multiplier", [1n << 128n, false]],
    ["noncanonical pause", [10n ** 18n, 0n]],
    ["truncated tuple", [10n ** 18n]],
    ["extra word", [10n ** 18n, false, 0n]],
  ]) {
    await t.test(label, async () => {
      const { state, read } = fixture();
      state.results[3] = params;
      await assert.rejects(read, /Invalid AAPLc registry observation/);
    });
  }
});

test("corporate-action pause remains observable and blocks the usable reference state", async () => {
  const { state, read, options } = fixture();
  state.results[3] = [10n ** 18n, true];
  const snapshot = await read();
  assert.equal(snapshot.assets[0].observation.oraclePaused, true);
  const stock = publicSnapshot(snapshot, options).stocks[0];
  assert.equal(stock.status, "oracle-paused");
  assert.equal(stock.openingPriceFresh, false);
  assert.equal(stock.sourceUpdatedAt, Number(NOW - 60n));
});

test("Total Return Value is never multiplied a second time", async () => {
  const { state, read, options } = fixture();
  state.results[3] = [10n * 10n ** 18n, false];
  const snapshot = await read();
  const stock = publicSnapshot(snapshot, options).stocks[0];
  assert.equal(snapshot.assets[0].observation.answer, 200_00000000n);
  assert.equal(stock.priceUsd, 200);
  assert.equal(stock.multiplier, 10);
  assert.equal(stock.priceAnswer, "20000000000");
  assert.equal(stock.multiplierRaw, "10000000000000000000");
});

test("sequencer outage is displayed and retained in relay observation rather than fabricated as healthy", async () => {
  const { state, read, options } = fixture();
  state.results[0][1] = 1n;
  const snapshot = await read();
  const display = publicSnapshot(snapshot, options);
  assert.equal(snapshot.assets[0].observation.sequencerAnswer, 1n);
  assert.equal(display.sequencerUp, false);
  assert.ok(display.stocks.every((stock) => stock.status === "sequencer-unavailable" && !stock.openingPriceFresh));
});

test("sequencer recovery requires more than one hour at the observed source block", async (t) => {
  for (const [seconds, expected] of [
    [3600n, false],
    [3601n, true],
  ]) {
    await t.test(String(seconds), async () => {
      const { state, read, options } = fixture();
      state.results[0][2] = state.block.timestamp - seconds;
      const snapshot = await read();
      // A later cache read cannot assert recovery that the source block did not yet observe.
      state.clockMs += 60_000;
      assert.equal(publicSnapshot(snapshot, options).sequencerUp, expected);
    });
  }
});

test("invalid sequencer statuses and future sequencer rounds are rejected", async (t) => {
  for (const [label, mutate] of [
    [
      "unknown answer",
      (round) => {
        round[1] = 2n;
      },
    ],
    [
      "zero start",
      (round) => {
        round[2] = 0n;
      },
    ],
    [
      "future start",
      (round) => {
        round[2] = NOW + 1n;
        round[3] = NOW + 1n;
      },
    ],
    [
      "future update",
      (round) => {
        round[3] = NOW + 1n;
      },
    ],
    [
      "incomplete round",
      (round) => {
        round[4] = 0n;
      },
    ],
  ]) {
    await t.test(label, async () => {
      const { state, read } = fixture();
      mutate(state.results[0]);
      await assert.rejects(read, /Invalid sequencer source observation/);
    });
  }
});

test("old unchanged sequencer status is valid when read at a fresh source block", async () => {
  const { state, read, options } = fixture();
  state.results[0][2] = NOW - 30n * 86400n;
  state.results[0][3] = NOW - 20n * 86400n;
  assert.equal(publicSnapshot(await read(), options).sequencerUp, true);
});

test("old equity prices remain old and are identified as stale even with a new state observation", async () => {
  const { state, read, options } = fixture();
  setPriceAge(state, 5 * 86400);
  const snapshot = await read();
  const display = publicSnapshot(snapshot, options);
  assert.equal(display.stocks[0].priceUsd, 200);
  assert.equal(display.stocks[0].status, "stale");
  assert.equal(display.stocks[0].priceAgeSeconds, 5 * 86400);
  assert.equal(display.stocks[0].openingPriceFresh, false);
  assert.equal(snapshot.assets[0].observation.updatedAt, NOW - 5n * 86400n);
  assert.equal(display.observedAt, Number(NOW - 4n));
});

test("public reference and opening freshness use their distinct exact boundaries", async (t) => {
  for (const [age, status, opening] of [
    [3600, "reference-available", true],
    [3601, "reference-available", false],
    [86400, "reference-available", false],
    [86401, "stale", false],
  ]) {
    await t.test(String(age), async () => {
      const { state, read, options } = fixture();
      setPriceAge(state, age);
      const stock = publicSnapshot(await read(), options).stocks[0];
      assert.equal(stock.priceAgeSeconds, age);
      assert.equal(stock.status, status);
      assert.equal(stock.openingPriceFresh, opening);
    });
  }
});

test("cached raw snapshots advance displayed price age but never source timestamps", async () => {
  const { state, read, options } = fixture();
  const snapshot = await read();
  const before = publicSnapshot(snapshot, options);
  state.clockMs += 60_000;
  const after = publicSnapshot(snapshot, options);
  assert.equal(before.stocks[0].priceAgeSeconds, 60);
  assert.equal(after.stocks[0].priceAgeSeconds, 120);
  assert.equal(after.stocks[0].sourceUpdatedAt, before.stocks[0].sourceUpdatedAt);
  assert.equal(after.observedAt, before.observedAt);
  assert.equal(after.evaluatedAt, before.evaluatedAt + 60);
  assert.equal(after.validUntil, before.observedAt + MAX_SOURCE_BLOCK_AGE_SECONDS);
  assert.equal(after.sourceBlockHash, HASH);
});

test("public conversion refuses expired snapshots and incorrect source-chain identities", async (t) => {
  await t.test("expired snapshot", async () => {
    const { state, read, options } = fixture();
    const snapshot = await read();
    state.clockMs += 121_000;
    assert.throws(() => publicSnapshot(snapshot, options), /Source block stale or future/);
  });
  await t.test("incorrect chain", async () => {
    const { read, options } = fixture();
    const snapshot = await read();
    snapshot.chainId = 84532;
    assert.throws(() => publicSnapshot(snapshot, options), /Base mainnet/);
  });
});

test("public conversion cannot relabel an arbitrary feed or token as an official Coinbase asset", async () => {
  const { read, options } = fixture();
  const snapshot = await read();
  snapshot.assets[0].feed = USDC.feed;
  assert.throws(() => publicSnapshot(snapshot, options), /canonical source identity/);
});

test("public conversion revalidates source rounds and non-equity state", async (t) => {
  await t.test("future round", async () => {
    const { read, options } = fixture();
    const snapshot = await read();
    snapshot.assets[0].round[3] = NOW + 1n;
    assert.throws(() => publicSnapshot(snapshot, options), /Invalid AAPLc source observation/);
  });
  await t.test("fabricated USDC multiplier", async () => {
    const { read, options } = fixture();
    const snapshot = await read();
    snapshot.assets[4].multiplier *= 2n;
    assert.throws(() => publicSnapshot(snapshot, options), /Invalid USDC non-equity state/);
  });
});

test("public output preserves exact large values as strings and remains JSON serializable", async () => {
  const { state, read, options } = fixture();
  state.results[1][0] = (1n << 80n) - 1n;
  state.results[1][4] = state.results[1][0];
  state.results[1][1] = 900719925474099312345n;
  const display = publicSnapshot(await read(), options);
  assert.equal(display.stocks[0].priceAnswer, "900719925474099312345");
  assert.equal(display.stocks[0].sourceRoundId, String((1n << 80n) - 1n));
  assert.equal(display.stocks[4].priceUsd, 1);
  assert.equal(display.stocks[4].multiplierRaw, String(10n ** 18n));
  assert.doesNotThrow(() => JSON.stringify(display));
});

test("exported canonical source identities cannot be accidentally mutated by a consumer", () => {
  assert.throws(() => {
    STOCKS[0].feed = USDC.feed;
  }, TypeError);
  assert.throws(() => {
    STOCKS.pop();
  }, TypeError);
  assert.throws(() => {
    USDC.symbol = "AAPLc";
  }, TypeError);
});
