import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { concatHex, decodeFunctionData, keccak256, numberToHex, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  fetchRedstonePackages,
  prepareRedstoneUpdate,
  REDSTONE_MON_FEED_ID,
  REDSTONE_UPDATE_ABI,
  verifyRedstoneDeployment,
} from "./redstone.mjs";
import { validateRedstonePackages } from "./redstone-wire.mjs";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/redstone-mon-historical.json", import.meta.url)));
const canonical = JSON.parse(readFileSync(new URL("../../config/monad.json", import.meta.url))).redstone;
const timestamp = 1790168142000;
const data = () => structuredClone(fixture.gatewayResponse);

test("authentic public MON packages preserve their complete signed bytes and recover canonical signers", async () => {
  const result = await validateRedstonePackages(data(), canonical, timestamp);
  assert.equal(result.price, "2567800");
  assert.equal(result.publishedAt, 1790168142);
  assert.deepEqual(result.signers, [canonical.authorizedSigners[3], canonical.authorizedSigners[4]]);
  assert.equal(result.payload.slice(2, 2 + 568), fixture.originalCalldata.slice(202, 202 + 568));
  assert.ok(result.payload.endsWith("0002000000000002ed57011e0000"));
});
test("official numeric and base64 values serialize identically; package label does not alter signed bytes", async () => {
  const numeric = data();
  for (const pkg of numeric.MON) {
    pkg.dataPackageId = "___FAST___";
    pkg.dataPoints[0].value = 0.025678;
    pkg.dataPoints[0].decimals = 8;
  }
  assert.deepEqual(
    await validateRedstonePackages(numeric, canonical, timestamp),
    await validateRedstonePackages(data(), canonical, timestamp),
  );
});
test("a complete multi-point FAST package retains every signed point before MON-only routing", async () => {
  // Explicitly synthetic test keys never leave this test and are not accepted by production config.
  const accounts = [1, 2].map((n) => privateKeyToAccount("0x" + String(n).repeat(64)));
  const testConfig = {
    ...canonical,
    authorizedSigners: [...accounts.map((a) => a.address), ...canonical.authorizedSigners.slice(0, 3)],
  };
  const unsigned = concatHex([
    stringToHex("ETH", { size: 32 }),
    numberToHex(2000n * 10n ** 8n, { size: 32 }),
    REDSTONE_MON_FEED_ID,
    numberToHex(2567800n, { size: 32 }),
    numberToHex(timestamp, { size: 6 }),
    numberToHex(32, { size: 4 }),
    numberToHex(2, { size: 3 }),
  ]);
  const MON = await Promise.all(
    accounts.map(async (account) => ({
      dataPackageId: "___FAST___",
      timestampMilliseconds: timestamp,
      // Deliberately unsorted gateway input; canonical serialization sorts feed ids.
      dataPoints: [
        { dataFeedId: "MON", value: 0.025678 },
        { dataFeedId: "ETH", value: 2000 },
      ],
      signature: Buffer.from((await account.sign({ hash: keccak256(unsigned) })).slice(2), "hex").toString("base64"),
    })),
  );
  const result = await validateRedstonePackages({ MON }, testConfig, timestamp);
  assert.equal(result.price, "2567800");
  assert.ok(result.payload.includes(unsigned.slice(2)));
  MON[0].dataPoints.pop();
  await assert.rejects(validateRedstonePackages({ MON }, testConfig, timestamp), /Invalid signed/);
});

for (const [name, mutate] of [
  [
    "duplicate signer",
    (d) => {
      d.MON[1] = structuredClone(d.MON[0]);
    },
  ],
  [
    "changed value",
    (d) => {
      d.MON[0].dataPoints[0].value = 0.03;
    },
  ],
  [
    "missing MON",
    (d) => {
      d.MON[0].dataPoints[0].dataFeedId = "ETH";
    },
  ],
  [
    "duplicate data feed",
    (d) => {
      d.MON[0].dataPoints.push(d.MON[0].dataPoints[0]);
    },
  ],
  [
    "mismatched timestamps",
    (d) => {
      d.MON[0].timestampMilliseconds += 1;
    },
  ],
  [
    "claimed signer mismatch",
    (d) => {
      d.MON[0].signerAddress = canonical.authorizedSigners[0];
    },
  ],
  [
    "invalid signature bytes",
    (d) => {
      d.MON[0].signature += "A";
    },
  ],
  [
    "invalid value bytes",
    (d) => {
      d.MON[0].dataPoints[0].value += "A";
    },
  ],
  [
    "numeric precision loss",
    (d) => {
      d.MON[0].dataPoints[0].value = 0.025678001;
    },
  ],
  [
    "nonstandard numeric decimals",
    (d) => {
      d.MON[0].dataPoints[0].value = 0.025678;
      d.MON[0].dataPoints[0].decimals = 6;
    },
  ],
  [
    "unbounded package count",
    (d) => {
      d.MON = Array(6).fill(d.MON[0]);
    },
  ],
  [
    "unbounded point count",
    (d) => {
      d.MON[0].dataPoints = Array(65).fill(d.MON[0].dataPoints[0]);
    },
  ],
  [
    "FAST response key instead of requested feed key",
    (d) => {
      d.___FAST___ = d.MON;
      delete d.MON;
    },
  ],
])
  test(`rejects ${name}`, async () => {
    const d = data();
    mutate(d);
    await assert.rejects(validateRedstonePackages(d, canonical, timestamp), /Invalid signed/);
  });

test("untrusted signer, stale observation and excessive future timestamp fail closed", async () => {
  await assert.rejects(
    validateRedstonePackages(
      data(),
      { ...canonical, authorizedSigners: Array(5).fill(canonical.authorizedSigners[0]) },
      timestamp,
    ),
    /Invalid signed/,
  );
  await assert.rejects(validateRedstonePackages(data(), canonical, timestamp + 30001), /fresh signed/);
  await assert.rejects(validateRedstonePackages(data(), canonical, timestamp - 5001), /fresh signed/);
});

test("gateway key remains a server header on a fixed URL with redirects disabled", async () => {
  let request;
  const result = await fetchRedstonePackages("test-only-secret", {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify(data()));
    },
  });
  assert.deepEqual(result, data());
  assert.equal(
    request.url,
    "https://oracle-gateway-api.b.redstone.finance/v2/data-packages/latest-by-data-feeds/redstone-primary-demo?dataFeedIds=MON",
  );
  assert.equal(request.options.headers["x-api-key"], "test-only-secret");
  assert.equal(request.options.redirect, "error");
});
test("missing credentials never request data; upstream failures never expose credentials or bodies", async () => {
  await assert.rejects(
    fetchRedstonePackages(undefined, { fetchImpl: () => assert.fail("must not fetch") }),
    /access is not configured/,
  );
  for (const fetchImpl of [
    async () => {
      throw new Error("test-only-secret");
    },
    async () => new Response("test-only-secret", { status: 403 }),
  ]) {
    await assert.rejects(
      fetchRedstonePackages("test-only-secret", { fetchImpl }),
      (error) => error.status === 503 && !error.message.includes("test-only-secret"),
    );
  }
});
test("invalid JSON and oversized actual or advertised response bodies are rejected", async () => {
  for (const response of [
    new Response("not-json"),
    new Response("{}", { headers: { "content-length": "262145" } }),
    new Response(" ".repeat(262145)),
  ]) {
    await assert.rejects(
      fetchRedstonePackages("test-only-secret", { fetchImpl: async () => response }),
      /Invalid signed/,
    );
  }
});

function mockRpc(overrides = {}) {
  const hash = keccak256("0x6000");
  const config = {
    ...canonical,
    runtimeCodehash: hash,
    adapterRuntimeCodehash: hash,
    sourceImplementation: { ...canonical.sourceImplementation, runtimeCodehash: hash },
    adapterImplementation: { ...canonical.adapterImplementation, runtimeCodehash: hash },
  };
  const client = {
    getChainId: async () => 10143,
    getBlock: async () => ({ number: 65020219n, timestamp: BigInt(timestamp / 1000) }),
    getCode: async () => "0x6000",
    getStorageAt: async ({ address }) =>
      "0x" +
      (address === config.address ? config.sourceImplementation.address : config.adapterImplementation.address)
        .slice(2)
        .padStart(64, "0"),
    readContract: async ({ functionName, args }) =>
      ({
        decimals: 8,
        description: "RedStone Price Feed for MON",
        getPriceFeedAdapter: config.adapter,
        getDataFeedId: REDSTONE_MON_FEED_ID,
        getUniqueSignersThreshold: 2,
        getAuthorisedSignerIndex: config.authorizedSigners.indexOf(args?.[0]),
        getLastUpdateDetailsUnsafe: [BigInt(timestamp - 2000), BigInt(timestamp / 1000 - 2), 2560000n],
      })[functionName],
    call: async ({ to, data, value, account }) => {
      assert.equal(to, canonical.adapter);
      assert.equal(value, 0n);
      assert.equal(account, "0x0000000000000000000000000000000000000001");
      const decoded = decodeFunctionData({ abi: REDSTONE_UPDATE_ABI, data });
      assert.deepEqual(decoded.args, [[REDSTONE_MON_FEED_ID]]);
      return {};
    },
    ...overrides,
  };
  return {
    client,
    config,
    apiKey: "test-only-secret",
    fetchImpl: async () => new Response(JSON.stringify(data())),
    now: () => timestamp,
  };
}
test("preparation verifies the pinned route then simulates an exact unsigned MON-only call", async () => {
  const result = await prepareRedstoneUpdate(mockRpc());
  assert.equal(result.chainId, 10143);
  assert.equal(result.adapter, canonical.adapter);
  assert.equal(result.feedId, REDSTONE_MON_FEED_ID);
  assert.equal(result.price, "2567800");
  assert.equal(result.expiresAt, timestamp + 30000);
  assert.equal(result.verifiedAtBlock, "65020219");
  assert.ok(!JSON.stringify(result).includes("test-only-secret"));
});
test("source/implementation changes, wrong chain, signer quorum changes and simulation rejection block preparation", async () => {
  for (const override of [
    { getChainId: async () => 1 },
    { getCode: async () => "0x6001" },
    { getStorageAt: async () => "0x" + "00".repeat(32) },
    { readContract: async () => 3 },
    {
      call: async () => {
        throw new Error("untrusted detailed RPC body");
      },
    },
  ])
    await assert.rejects(
      prepareRedstoneUpdate(mockRpc(override)),
      (error) => error.status === 503 && !error.message.includes("untrusted"),
    );
});
test("adapter/source relationship and unique on-chain signer indexes must match", async () => {
  for (const change of [
    "getPriceFeedAdapter",
    "getDataFeedId",
    "getUniqueSignersThreshold",
    "getAuthorisedSignerIndex",
  ]) {
    const args = mockRpc();
    const read = args.client.readContract;
    args.client.readContract = async (req) =>
      req.functionName === change
        ? change.startsWith("getA") || change.startsWith("getU")
          ? 0
          : "0x" + "00".repeat(32)
        : read(req);
    await assert.rejects(verifyRedstoneDeployment(args.client, args.config, 1n), /identity changed/);
  }
});
test("already published updates and slow preparation never become reusable transactions", async () => {
  const args = mockRpc();
  const read = args.client.readContract;
  args.client.readContract = async (req) =>
    req.functionName === "getLastUpdateDetailsUnsafe" ? [BigInt(timestamp), 0n, 0n] : read(req);
  await assert.rejects(prepareRedstoneUpdate(args), /newer signed/);
  const slow = mockRpc();
  let calls = 0;
  slow.now = () => timestamp + (calls++ ? 30001 : 0);
  await assert.rejects(prepareRedstoneUpdate(slow), /fresh signed/);
});
