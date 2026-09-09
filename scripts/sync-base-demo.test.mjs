import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAddress, keccak256, toHex, zeroHash } from "viem";
import { DEMO_KIND, DEPLOYER, MIGRATION_RECIPIENT, DEMO_ASSETS } from "./deploy-base-demo.mjs";
import {
  validateDemoPublicationManifest,
  renderDemoPublication,
  verifyDemoPublication,
  publishDemoDeployment,
} from "./sync-base-demo.mjs";

const modules = JSON.parse(readFileSync(new URL("../contracts/config/base-modules.json", import.meta.url), "utf8"));
const address = (n) => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const now = () => 1_800_000_010_000;
const blockHash = keccak256(toHex("publication block"));
function fixture() {
  const inherited = [
    ...new Set([
      "Timelock",
      "YSToken",
      "Governor",
      "TokenWhitelistLib",
      "PoolCreationLib",
      "PoolValidationLib",
      "BaseFactoryRouter",
      ...Object.values(modules).flatMap((c) => Object.values(c.modules).map((g) => g.contract)),
    ]),
  ];
  const names = [
    ...inherited,
    "AlphaPoolInitializeModule",
    "BasePoolRouter",
    "Factory",
    "DemoOracle",
    "DemoExchange",
    "CompositeOracle",
    "Faucet",
    ...DEMO_ASSETS.map((a) => `Token:${a.sourceSymbol}`),
  ];
  const m = {
    schemaVersion: 2,
    deploymentKind: DEMO_KIND,
    chainId: 84532,
    deployer: DEPLOYER,
    status: "complete",
    inheritedFrom: "base-sepolia-alpha.json",
    inheritedContracts: inherited,
    recipeHash: "11".repeat(32),
    completedAt: "2027-01-15T08:00:00.000Z",
    contracts: {},
    transactions: {},
    assets: [],
    pools: [],
  };
  let nonce = 0;
  function transaction(id, created = null) {
    const hash = keccak256(toHex(id));
    m.transactions[id] = {
      status: "confirmed",
      hash,
      intentHash: hash.slice(2),
      request: { chainId: 84532, nonce: nonce++, data: "0x1234", value: "0", ...(created ? {} : { to: address(999) }) },
      receipt: {
        transactionHash: hash,
        blockHash,
        blockNumber: id.startsWith("deploy:") && inherited.includes(id.slice(7)) ? "1" : "100",
        contractAddress: created,
      },
    };
    return hash;
  }
  for (const [i, name] of names.entries()) {
    const target = address(i + 1),
      artifact = name.startsWith("Token:")
        ? "BaseSepoliaAlphaToken"
        : ({
            Timelock: "YSTimelockController",
            Governor: "YSGovernor",
            Factory: "ERC1967Proxy",
            DemoOracle: "AlphaScenarioOracle",
            DemoExchange: "AlphaStockExchange",
            Faucet: "ConfigurableTokenFaucet",
          }[name] ?? name);
    m.contracts[name] = {
      address: target,
      artifact,
      runtimeCodehash: keccak256(toHex(name)),
      txHash: transaction(`deploy:${name}`, target),
    };
  }
  const c = (name) => m.contracts[name].address;
  for (const [i, a] of DEMO_ASSETS.entries()) {
    const isEquity = i < 4,
      symbol = isEquity ? `t${a.sourceSymbol}` : "TestUSDC";
    m.assets.push({
      ...a,
      basePrice: String(a.basePrice),
      symbol,
      isEquity,
      decimals: isEquity ? 8 : 6,
      testToken: c(`Token:${a.sourceSymbol}`),
    });
    for (const prefix of ["factory:whitelist", "exchange:fund", "faucet:fund"]) transaction(`${prefix}:${symbol}`);
    if (isEquity) {
      m.pools.push({
        symbol,
        address: address(1000 + i),
        shieldedToken: c(`Token:${a.sourceSymbol}`),
        backingToken: c("Token:USDC"),
      });
      for (const prefix of ["approve:factory", "pool:create", "approve:backing", "seed:backing"])
        transaction(`${prefix}:${symbol}`);
    }
  }
  for (const id of [
    "composite:factory-ownership",
    "factory:composite",
    "factory:fee-recipient",
    "factory:strict-usdc",
    "factory:finalize-bootstrap",
    "ownership:factory",
    "faucet:configure",
    "ownership:faucet",
    "migration:starter-basket",
  ])
    transaction(id);
  m.migration = { recipient: MIGRATION_RECIPIENT, txHash: m.transactions["migration:starter-basket"].hash };
  m.pricing = {
    kind: "deterministic-demo",
    oracle: c("DemoOracle"),
    exchange: c("DemoExchange"),
    cycleSeconds: 7200,
    basePrices: Object.fromEntries(
      DEMO_ASSETS.filter((a) => a.sourceSymbol !== "USDC").map((a) => [a.sourceSymbol, String(a.basePrice)]),
    ),
  };
  const available = { state: "available" },
    position = { state: "position-required" };
  const status = {
    schemaVersion: 2,
    chainId: 84532,
    deploymentKind: DEMO_KIND,
    policy: { kind: "continuous-demo" },
    source: null,
    session: { state: "continuous" },
    evaluatedAt: 1_800_000_010,
    validUntil: 1_800_000_060,
    destination: { blockNumber: "1000", blockHash, blockTimestamp: 1_800_000_000 },
    deployment: { status: "complete", verified: true, poolsReady: 4 },
    faucet: {
      verified: true,
      configured: true,
      address: c("Faucet"),
      tokens: m.assets.map((a) => ({ address: a.testToken, ready: true })),
    },
    exchange: { verified: true, ready: true, address: c("DemoExchange") },
    assets: m.assets
      .filter((a) => a.isEquity)
      .map((a) => ({
        symbol: a.symbol,
        pool: {
          state: "ready",
          terms: { protectedExitDelaySeconds: 60, collateralUnlockSeconds: 120 },
          capacity: { maxDepositBaseUnits: "100000000", maxCollateralDepositBaseUnits: "1000000" },
        },
        executionPrice: { kind: "deterministic-demo", marketObservation: false, priceUsd: 100 },
        actions: {
          openPosition: available,
          provideCollateral: available,
          withdrawStock: position,
          protectedExit: position,
          withdrawCollateral: position,
        },
        trading: {
          buy: available,
          sell: available,
          capacity: { maxBuyStockBaseUnits: "2500000000", maxSellStockBaseUnits: "2500000000" },
        },
      })),
  };
  const calls = [];
  const client = {
    getChainId: async () => 84532,
    getBlock: async () => ({ number: 1000n, hash: blockHash, timestamp: 1_800_000_000n }),
  };
  const checks = {
    artifacts: async () => {
      calls.push("artifacts");
    },
    wiring: async () => {
      calls.push("wiring");
    },
    status: async () => {
      calls.push("status");
      return status;
    },
  };
  return { manifest: m, status, calls, client, checks, now };
}

test("render is deterministic, preserves Robinhood and uses earliest new receipt", () => {
  const f = fixture(),
    rendered = renderDemoPublication(f.manifest);
  assert.equal(rendered.deploymentBlock, 100n);
  assert.equal(Object.keys(rendered.files).length, 4);
  const deployments = rendered.files["packages/adapter-evm/src/deployments.ts"];
  assert.match(deployments, /46630:/);
  assert.match(deployments, /0x067E0566c8242D57e1aF9FfecD18150C84F98E92/);
  assert.match(deployments, /deploymentBlock: 100n/);
  const demos = rendered.files["packages/adapter-evm/src/demo-deployments.ts"];
  assert.match(demos, /exchangeCodehash/);
  assert.match(demos, /oracleCodehash/);
  assert.match(demos, /"tAAPLc"/);
  const index = JSON.parse(rendered.files["contracts/deployments/84532.json"]);
  assert.equal(index.pricing, "synthetic-demo");
  assert.equal(index.chainId, 84532);
  assert.equal(index.transactions, undefined);
  const shuffled = structuredClone(f.manifest);
  shuffled.assets.reverse();
  shuffled.pools.reverse();
  shuffled.contracts = Object.fromEntries(Object.entries(shuffled.contracts).reverse());
  assert.deepEqual(renderDemoPublication(shuffled), rendered);
});

for (const [name, mutate] of [
  [
    "incomplete",
    (m) => {
      m.status = "preparing";
    },
  ],
  [
    "wrong chain",
    (m) => {
      m.chainId = 8453;
    },
  ],
  [
    "wrong schema",
    (m) => {
      m.schemaVersion = 1;
    },
  ],
  [
    "wrong kind",
    (m) => {
      m.deploymentKind = "live";
    },
  ],
  [
    "live source",
    (m) => {
      m.sourceChainId = 8453;
    },
  ],
  [
    "duplicate asset",
    (m) => {
      m.assets[1] = structuredClone(m.assets[0]);
    },
  ],
  [
    "duplicate pool",
    (m) => {
      m.pools[1].address = m.pools[0].address;
    },
  ],
  [
    "missing pool",
    (m) => {
      m.pools.pop();
    },
  ],
  [
    "missing initializer",
    (m) => {
      delete m.contracts.AlphaPoolInitializeModule;
    },
  ],
  [
    "wrong inherited inventory",
    (m) => {
      m.inheritedContracts.pop();
    },
  ],
  [
    "simulation flag",
    (m) => {
      m.simulated = true;
    },
  ],
  [
    "broadcast flag",
    (m) => {
      m.broadcast = false;
    },
  ],
  [
    "plan provenance",
    (m) => {
      m.mode = "prepare-only";
    },
  ],
  [
    "unconfirmed receipt",
    (m) => {
      m.transactions["faucet:configure"].status = "prepared";
    },
  ],
  [
    "zero receipt block hash",
    (m) => {
      m.transactions["faucet:configure"].receipt.blockHash = zeroHash;
    },
  ],
  [
    "wrong transaction chain",
    (m) => {
      m.transactions["faucet:configure"].request.chainId = 8453;
    },
  ],
  [
    "wrong transaction value",
    (m) => {
      m.transactions["faucet:configure"].request.value = "1";
    },
  ],
  [
    "mismatched receipt",
    (m) => {
      m.transactions["faucet:configure"].receipt.transactionHash = zeroHash;
    },
  ],
  [
    "missing funding",
    (m) => {
      delete m.transactions["exchange:fund:tAAPLc"];
    },
  ],
  [
    "wrong creation target",
    (m) => {
      m.transactions["deploy:DemoOracle"].receipt.contractAddress = address(555);
    },
  ],
  [
    "wrong artifact",
    (m) => {
      m.contracts.DemoOracle.artifact = "ChainlinkOracleFeed";
    },
  ],
  [
    "wrong source provenance",
    (m) => {
      m.assets[0].sourceFeed = address(500);
    },
  ],
  [
    "unexpected transaction",
    (m) => {
      m.transactions["unreviewed:call"] = {
        ...structuredClone(m.transactions["faucet:configure"]),
        hash: keccak256(toHex("extra")),
        request: { ...m.transactions["faucet:configure"].request, nonce: 999 },
        receipt: { ...m.transactions["faucet:configure"].receipt, transactionHash: keccak256(toHex("extra")) },
      };
    },
  ],
  [
    "changed base price",
    (m) => {
      m.assets[0].basePrice = "1";
    },
  ],
  [
    "duplicate nonce",
    (m) => {
      m.transactions["faucet:configure"].request.nonce = m.transactions["ownership:faucet"].request.nonce;
    },
  ],
])
  test(`reject ${name} before rendering`, () => {
    const f = fixture();
    mutate(f.manifest);
    assert.throws(() => renderDemoPublication(f.manifest));
  });

test("mandatory artifact and module verification precede fresh live readiness", async () => {
  const f = fixture();
  const result = await verifyDemoPublication(f);
  assert.deepEqual(f.calls, ["artifacts", "wiring", "status"]);
  assert.equal(result.verifiedBlock, 1000n);
  const failed = fixture();
  failed.checks.wiring = async () => {
    throw Error("wrong module");
  };
  await assert.rejects(verifyDemoPublication(failed), /wrong module/);
  assert.deepEqual(failed.calls, ["artifacts"]);
});
for (const [name, mutate] of [
  [
    "stale status",
    (s) => {
      s.validUntil = 1_800_000_010;
    },
  ],
  [
    "future status",
    (s) => {
      s.destination.blockTimestamp = 1_800_000_020;
    },
  ],
  [
    "unsealed status",
    (s) => {
      s.destination.blockHash = zeroHash;
    },
  ],
  [
    "unfunded faucet",
    (s) => {
      s.faucet.tokens[4].ready = false;
    },
  ],
  [
    "missing capacity",
    (s) => {
      s.assets[0].pool.capacity = null;
    },
  ],
  [
    "blocked opening",
    (s) => {
      s.assets[0].actions.openPosition = { state: "blocked" };
    },
  ],
  [
    "wrong demo wait",
    (s) => {
      s.assets[0].pool.terms.protectedExitDelaySeconds = 86400;
    },
  ],
  [
    "unavailable stock sale",
    (s) => {
      s.assets[2].trading.sell = { state: "blocked" };
    },
  ],
  [
    "claimed market price",
    (s) => {
      s.assets[0].executionPrice.marketObservation = true;
    },
  ],
])
  test(`reject ${name} after artifact verification`, async () => {
    const f = fixture();
    mutate(f.status);
    await assert.rejects(verifyDemoPublication(f));
  });

test("final snapshot reorg and manifest mutation abort publication", async () => {
  const reorg = fixture();
  reorg.client.getBlock = async () => ({ number: 1000n, hash: keccak256(toHex("changed")), timestamp: 1_800_000_000n });
  await assert.rejects(verifyDemoPublication(reorg), /reorged/);
  const changed = fixture();
  changed.checks.status = async () => {
    changed.manifest.completedAt = "2027-01-16T00:00:00Z";
    return changed.status;
  };
  await assert.rejects(verifyDemoPublication(changed), /changed during verification/);
});

test("default only verifies; explicit write publishes all outputs after checks", async () => {
  const root = mkdtempSync(join(tmpdir(), "yieldshield-demo-publication-"));
  try {
    mkdirSync(join(root, "packages/adapter-evm/src"), { recursive: true });
    mkdirSync(join(root, "contracts/deployments"), { recursive: true });
    const f = fixture();
    const readOnly = await publishDemoDeployment({ ...f, outputRoot: root });
    assert.equal(readOnly.written, false);
    assert.deepEqual(readdirSync(join(root, "packages/adapter-evm/src")), []);
    const result = await publishDemoDeployment({ ...fixture(), outputRoot: root, write: true });
    for (const [path, content] of Object.entries(result.files))
      assert.equal(readFileSync(join(root, path), "utf8"), content);
    const original = readFileSync(join(root, "packages/adapter-evm/src/deployments.ts"), "utf8");
    const failed = fixture();
    failed.checks.artifacts = async () => {
      throw Error("runtime changed");
    };
    await assert.rejects(publishDemoDeployment({ ...failed, outputRoot: root, write: true }), /runtime changed/);
    assert.equal(readFileSync(join(root, "packages/adapter-evm/src/deployments.ts"), "utf8"), original);
    assert(readdirSync(join(root, "packages/adapter-evm/src")).every((name) => !name.endsWith(".tmp")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed staging cannot replace an earlier configuration", async () => {
  const root = mkdtempSync(join(tmpdir(), "yieldshield-demo-publication-"));
  try {
    mkdirSync(join(root, "packages/adapter-evm/src"), { recursive: true });
    const path = join(root, "packages/adapter-evm/src/deployments.ts");
    writeFileSync(path, "original");
    await assert.rejects(publishDemoDeployment({ ...fixture(), outputRoot: root, write: true }));
    assert.equal(readFileSync(path, "utf8"), "original");
    assert.deepEqual(readdirSync(join(root, "packages/adapter-evm/src")), ["deployments.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("publication requires a completed receipt inventory, never a verified flag", () => {
  const f = fixture();
  f.manifest.verified = true;
  delete f.manifest.transactions["seed:backing:tAAPLc"];
  assert.throws(() => validateDemoPublicationManifest(f.manifest), /missing pool provenance/);
});
