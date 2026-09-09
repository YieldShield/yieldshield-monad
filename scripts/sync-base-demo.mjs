#!/usr/bin/env node
/** Read-only by default. Publish only a complete independently verified synthetic Sepolia demo. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createPublicClient, http, getAddress, zeroHash } from "viem";
import { baseSepolia } from "viem/chains";
import * as recipe from "./deploy-base-demo.mjs";
import { validateDemoManifest, readDemoStatus } from "../services/base-demo-status.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = JSON.parse(readFileSync(resolve(ROOT, "contracts/config/base-modules.json"), "utf8"));
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const stringify = (v) => JSON.stringify(v, (_, n) => (typeof n === "bigint" ? String(n) : n), 2) + "\n";
const positiveInteger = (v) => (typeof v === "string" && /^[1-9]\d*$/.test(v)) || (typeof v === "bigint" && v > 0n);
const hash = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && !same(v, zeroHash);
const expectedInherited = [
  ...new Set([
    "Timelock",
    "YSToken",
    "Governor",
    "TokenWhitelistLib",
    "PoolCreationLib",
    "PoolValidationLib",
    "BaseFactoryRouter",
    ...Object.values(MODULES).flatMap((c) => Object.values(c.modules).map((g) => g.contract)),
  ]),
];
const expectedArtifacts = Object.fromEntries([
  ...expectedInherited.map((name) => [
    name,
    { Timelock: "YSTimelockController", Governor: "YSGovernor" }[name] ?? name,
  ]),
  ["AlphaPoolInitializeModule", "AlphaPoolInitializeModule"],
  ["BasePoolRouter", "BasePoolRouter"],
  ["Factory", "ERC1967Proxy"],
  ["DemoOracle", "AlphaScenarioOracle"],
  ["DemoExchange", "AlphaStockExchange"],
  ["CompositeOracle", "CompositeOracle"],
  ["Faucet", "ConfigurableTokenFaucet"],
  ...recipe.DEMO_ASSETS.map((a) => [`Token:${a.sourceSymbol}`, "BaseSepoliaAlphaToken"]),
]);

/** Pure manifest validation is necessary but never sufficient authorization to publish. */
export function validateDemoPublicationManifest(manifest) {
  const plan = validateDemoManifest(manifest);
  assert.equal(manifest.status, "complete", "Demo publication requires completed deployment");
  assert.equal(manifest.inheritedFrom, "base-sepolia-alpha.json", "Unreviewed inherited deployment");
  assert(Array.isArray(manifest.inheritedContracts), "Missing inherited deployment inventory");
  assert.deepEqual(
    [...manifest.inheritedContracts].sort(),
    [...expectedInherited].sort(),
    "Unreviewed inherited contracts",
  );
  assert.deepEqual(
    Object.keys(manifest.contracts).sort(),
    Object.keys(expectedArtifacts).sort(),
    "Missing or unexpected demo modules/contracts",
  );
  assert(
    typeof manifest.recipeHash === "string" && /^[0-9a-f]{64}$/.test(manifest.recipeHash),
    "Missing deployment recipe provenance",
  );
  assert(
    typeof manifest.completedAt === "string" && Number.isFinite(Date.parse(manifest.completedAt)),
    "Missing completion record",
  );
  for (const [flag, value] of Object.entries({
    simulated: false,
    prepareOnly: false,
    dryRun: false,
    broadcast: true,
  })) {
    if (Object.hasOwn(manifest, flag))
      assert.equal(manifest[flag], value, "Simulation/prepare provenance cannot be published");
  }
  assert(!Object.hasOwn(manifest, "mode") || manifest.mode === "broadcast", "Plan provenance cannot be published");
  assert(manifest.calendar == null && manifest.sourceSnapshot == null, "Demo must not carry live-source provenance");
  const requiredTransactions = new Set(Object.keys(expectedArtifacts).map((name) => `deploy:${name}`));
  const inheritedTransactions = new Set(expectedInherited.map((name) => `deploy:${name}`));
  const hashes = new Set(),
    nonces = new Set();
  let deploymentBlock;
  for (const [id, tx] of Object.entries(manifest.transactions)) {
    assert(
      tx.status === "confirmed" && hash(tx.hash) && same(tx.receipt?.transactionHash, tx.hash),
      `${id}: unconfirmed or mismatched receipt`,
    );
    assert(!hashes.has(tx.hash.toLowerCase()), `${id}: reused transaction hash`);
    hashes.add(tx.hash.toLowerCase());
    assert(hash(tx.receipt.blockHash) && positiveInteger(tx.receipt.blockNumber), `${id}: unsealed deployment receipt`);
    if (Object.hasOwn(tx.receipt, "status")) assert.equal(tx.receipt.status, "success", `${id}: unsuccessful receipt`);
    assert(tx.request?.chainId === 84532 && BigInt(tx.request.value) === 0n, `${id}: wrong transaction chain or value`);
    assert(Number.isSafeInteger(tx.request.nonce) && tx.request.nonce >= 0, `${id}: invalid deployment nonce`);
    assert(!nonces.has(tx.request.nonce), `${id}: reused deployment nonce`);
    nonces.add(tx.request.nonce);
    assert(
      typeof tx.request.data === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(tx.request.data),
      `${id}: missing exact transaction calldata`,
    );
    assert(
      typeof tx.intentHash === "string" && /^[0-9a-f]{64}$/.test(tx.intentHash),
      `${id}: missing transaction intent provenance`,
    );
    if (!inheritedTransactions.has(id)) {
      const height = BigInt(tx.receipt.blockNumber);
      if (deploymentBlock === undefined || height < deploymentBlock) deploymentBlock = height;
    }
  }
  for (const [name, record] of Object.entries(manifest.contracts)) {
    assert.equal(record.artifact, expectedArtifacts[name], `${name}: wrong artifact identity`);
    const tx = manifest.transactions[`deploy:${name}`];
    assert(
      tx.request.to == null && same(tx.receipt.contractAddress, record.address),
      `${name}: wrong creation provenance`,
    );
  }
  for (const asset of plan.assets) {
    const expected = recipe.DEMO_ASSETS.find((a) => a.sourceSymbol === asset.sourceSymbol);
    assert.equal(asset.basePrice, String(expected.basePrice), `${asset.symbol}: unreviewed scenario price`);
    for (const prefix of ["factory:whitelist", "exchange:fund", "faucet:fund"]) {
      requiredTransactions.add(`${prefix}:${asset.symbol}`);
      assert(
        manifest.transactions[`${prefix}:${asset.symbol}`],
        `${asset.symbol}: missing configured/funded provenance`,
      );
    }
    if (asset.isEquity)
      for (const prefix of ["approve:factory", "pool:create", "approve:backing", "seed:backing"]) {
        requiredTransactions.add(`${prefix}:${asset.symbol}`);
        assert(manifest.transactions[`${prefix}:${asset.symbol}`], `${asset.symbol}: missing pool provenance`);
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
  ]) {
    requiredTransactions.add(id);
    assert(manifest.transactions[id], `${id}: missing completed setup transaction`);
  }
  assert.deepEqual(
    Object.keys(manifest.transactions).sort(),
    [...requiredTransactions].sort(),
    "Unexpected deployment transaction provenance",
  );
  assert(
    same(manifest.migration?.recipient, recipe.MIGRATION_RECIPIENT) &&
      same(manifest.migration.txHash, manifest.transactions["migration:starter-basket"].hash),
    "Missing starter-basket provenance",
  );
  assert(deploymentBlock !== undefined, "Missing new deployment transactions");
  return { ...plan, deploymentBlock };
}

/** Deterministic rendering; call verifyDemoPublication before writing these outputs. */
export function renderDemoPublication(manifest) {
  const { c, assets, deploymentBlock } = validateDemoPublicationManifest(manifest);
  const equities = assets
    .filter((a) => a.isEquity)
    .map((a) => ({ token: a.testToken, symbol: a.symbol, name: a.name, decimals: 8 }));
  const header = "// Generated only after complete synthetic Base Sepolia deployment verification.\n";
  const deployments = `${header}import type { Address } from "viem";\nexport type EvmDeployment = { factory: Address; compositeOracle: Address; faucet?: Address; deploymentBlock?: bigint };\nexport const DEPLOYMENTS: Record<number, EvmDeployment> = {\n  46630: {\n    factory: "0x067E0566c8242D57e1aF9FfecD18150C84F98E92",\n    compositeOracle: "0x67A89f76Ae9a89866a0E62785d7999efE1c5E592",\n    faucet: "0x6c4DdBC132C8e0aee4869334e449d664c40a147C",\n  },\n  84532: {\n    factory: "${c("Factory")}",\n    compositeOracle: "${c("CompositeOracle")}",\n    faucet: "${c("Faucet")}",\n    deploymentBlock: ${deploymentBlock}n,\n  },\n};\n`;
  const demo = {
    chainId: 84532,
    exchange: c("DemoExchange"),
    oracle: c("DemoOracle"),
    exchangeCodehash: manifest.contracts.DemoExchange.runtimeCodehash,
    oracleCodehash: manifest.contracts.DemoOracle.runtimeCodehash,
    quoteToken: c("Token:USDC"),
    assets: equities,
  };
  const demos = `${header}import type { Address, Hash } from "viem";\nexport type DemoDeployment = { chainId: 84532; exchange: Address; oracle: Address; exchangeCodehash: Hash; oracleCodehash: Hash; quoteToken: Address; assets: readonly { token: Address; symbol: string; name: string; decimals: 8 }[] };\nexport const DEMO_DEPLOYMENTS: Readonly<Record<number, DemoDeployment>> = ${JSON.stringify({ 84532: demo }, null, 2)};\n`;
  const faucets = `${header}import type { Address } from "viem";\nexport const FAUCET_DEPLOYMENTS: Readonly<Record<number, Address>> = {\n  84532: "${c("Faucet")}",\n};\n`;
  const publicIndex = {
    schemaVersion: 2,
    chainId: 84532,
    deploymentKind: recipe.DEMO_KIND,
    status: "complete",
    pricing: "synthetic-demo",
    deployer: recipe.DEPLOYER,
    deploymentBlock: String(deploymentBlock),
    ...Object.fromEntries(
      Object.entries(manifest.contracts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, r]) => [getAddress(r.address), name]),
    ),
    ...Object.fromEntries(
      [...manifest.pools]
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .map((p) => [getAddress(p.address), `Demo ${p.symbol} protection pool`]),
    ),
  };
  return {
    deploymentBlock,
    files: {
      "packages/adapter-evm/src/deployments.ts": deployments,
      "packages/adapter-evm/src/demo-deployments.ts": demos,
      "packages/adapter-evm/src/faucet-deployments.ts": faucets,
      "contracts/deployments/84532.json": stringify(publicIndex),
    },
  };
}

export function assertDemoPublicationStatus(status, manifest, now = Date.now) {
  const { c, assets } = validateDemoPublicationManifest(manifest),
    current = Math.floor(now() / 1000);
  assert(
    status?.schemaVersion === 2 && status.chainId === 84532 && status.deploymentKind === recipe.DEMO_KIND,
    "Wrong live demo status identity",
  );
  assert(
    status.policy?.kind === "continuous-demo" && status.source == null && status.session?.state === "continuous",
    "Wrong demo pricing policy",
  );
  assert(
    Number.isSafeInteger(current) &&
      Number.isSafeInteger(status.evaluatedAt) &&
      Number.isSafeInteger(status.validUntil) &&
      status.evaluatedAt <= current &&
      current < status.validUntil &&
      status.validUntil - current <= 60,
    "Expired or future demo status",
  );
  assert(
    status.destination &&
      positiveInteger(status.destination.blockNumber) &&
      hash(status.destination.blockHash) &&
      Number.isSafeInteger(status.destination.blockTimestamp) &&
      status.destination.blockTimestamp <= current &&
      current - status.destination.blockTimestamp < 60,
    "Unsealed or stale publication block",
  );
  assert(
    status.deployment?.status === "complete" &&
      status.deployment.verified === true &&
      status.deployment.poolsReady === 4,
    "Demo pools not fully verified",
  );
  assert(
    status.faucet?.verified === true && status.faucet.configured === true && same(status.faucet.address, c("Faucet")),
    "Demo faucet not verified",
  );
  assert(
    status.faucet.tokens?.length === 5 &&
      assets.every((a) => status.faucet.tokens.some((t) => same(t.address, a.testToken) && t.ready === true)),
    "All five faucet assets must be funded",
  );
  assert(
    status.exchange?.verified === true &&
      status.exchange.ready === true &&
      same(status.exchange.address, c("DemoExchange")),
    "Demo exchange unavailable",
  );
  assert(status.assets?.length === 4, "Demo status needs all four stocks");
  for (const asset of assets.filter((a) => a.isEquity)) {
    const matches = status.assets.filter((a) => a.symbol === asset.symbol);
    assert.equal(matches.length, 1, "Duplicate or missing live stock status");
    const a = matches[0],
      terms = a.pool?.terms;
    assert(
      a.pool?.state === "ready" && terms?.protectedExitDelaySeconds === 60 && terms.collateralUnlockSeconds === 120,
      `${asset.symbol}: wrong demo protection terms`,
    );
    assert(
      a.executionPrice?.kind === "deterministic-demo" &&
        a.executionPrice.marketObservation === false &&
        Number.isFinite(a.executionPrice.priceUsd) &&
        a.executionPrice.priceUsd > 0,
      `${asset.symbol}: missing synthetic price`,
    );
    assert(
      positiveInteger(a.pool.capacity?.maxDepositBaseUnits) &&
        positiveInteger(a.pool.capacity?.maxCollateralDepositBaseUnits),
      `${asset.symbol}: no verified protection capacity`,
    );
    for (const name of ["openPosition", "provideCollateral"])
      assert.equal(a.actions?.[name]?.state, "available", `${asset.symbol}: ${name} unavailable`);
    for (const name of ["withdrawStock", "protectedExit", "withdrawCollateral"])
      assert.equal(a.actions?.[name]?.state, "position-required", `${asset.symbol}: ${name} unavailable`);
    for (const side of ["buy", "sell"])
      assert.equal(a.trading?.[side]?.state, "available", `${asset.symbol}: ${side} unavailable`);
    for (const field of ["maxBuyStockBaseUnits", "maxSellStockBaseUnits"])
      assert(positiveInteger(a.trading?.capacity?.[field]), `${asset.symbol}: no execution capacity`);
  }
}

/** Both reviewed deployment helpers are mandatory. Injectable checks only support isolated tests. */
export async function verifyDemoPublication({ manifest, client, now = Date.now, checks = {} }) {
  validateDemoPublicationManifest(manifest);
  const original = stringify(manifest);
  const artifacts = checks.artifacts ?? recipe.verifyDemoArtifacts;
  const wiring = checks.wiring ?? recipe.verifyDemoWiring;
  const statusReader = checks.status ?? readDemoStatus;
  assert(
    typeof artifacts === "function" && typeof wiring === "function",
    "Reviewed demo artifact/module verification is required",
  );
  assert.equal(await client.getChainId(), 84532, "Wrong publication RPC chain");
  await artifacts(client, manifest);
  await wiring(client, manifest);
  const status = await statusReader({ client, manifest, now });
  assertDemoPublicationStatus(status, manifest, now);
  const block = await client.getBlock({ blockNumber: BigInt(status.destination.blockNumber) });
  assert(
    block.number === BigInt(status.destination.blockNumber) &&
      same(block.hash, status.destination.blockHash) &&
      block.timestamp === BigInt(status.destination.blockTimestamp),
    "Publication snapshot reorged",
  );
  assertDemoPublicationStatus(status, manifest, now);
  assert.equal(stringify(manifest), original, "Deployment manifest changed during verification");
  return { ...renderDemoPublication(manifest), verifiedBlock: block.number, verifiedBlockHash: block.hash };
}

function writePublication(files, outputRoot) {
  const staged = [],
    published = [];
  try {
    // Stage every output before replacing anything. Restore earlier files if a later rename fails.
    for (const [relative, contents] of Object.entries(files)) {
      const target = resolve(outputRoot, relative),
        temporary = `${target}.${randomUUID()}.tmp`;
      const original = existsSync(target) ? readFileSync(target) : null;
      staged.push({ target, temporary, original });
      writeFileSync(temporary, contents, { flag: "wx" });
    }
    for (const file of staged) {
      renameSync(file.temporary, file.target);
      published.push(file);
    }
  } catch (error) {
    for (const file of published.reverse()) {
      if (file.original === null) unlinkSync(file.target);
      else writeFileSync(file.target, file.original);
    }
    throw error;
  } finally {
    for (const file of staged) if (existsSync(file.temporary)) unlinkSync(file.temporary);
  }
}
export async function publishDemoDeployment({
  write = false,
  outputRoot = ROOT,
  beforeWrite = () => {},
  ...verification
}) {
  assert.equal(typeof write, "boolean", "Publication requires an explicit boolean write option");
  const result = await verifyDemoPublication(verification);
  if (write) {
    beforeWrite();
    writePublication(result.files, outputRoot);
  }
  return { ...result, written: write };
}

export async function main() {
  const args = process.argv.slice(2);
  assert(args.length <= 1 && args.every((a) => a === "--write"), "Usage: node scripts/sync-base-demo.mjs [--write]");
  const path = resolve(ROOT, "contracts/deployments/base-sepolia-demo-v1.json"),
    original = readFileSync(path, "utf8");
  const manifest = JSON.parse(original);
  validateDemoPublicationManifest(manifest);
  execFileSync(process.execPath, [resolve(ROOT, "scripts/verify-base-modules.mjs"), "--check"], {
    cwd: ROOT,
    stdio: "inherit",
  });
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com", {
      batch: { batchSize: 20, wait: 20 },
      retryCount: 2,
      timeout: 20000,
    }),
  });
  const result = await publishDemoDeployment({
    manifest,
    client,
    write: args.includes("--write"),
    beforeWrite: () =>
      assert.equal(readFileSync(path, "utf8"), original, "Deployment manifest changed before publication"),
  });
  console.log(
    result.written
      ? "Published four verified demo configuration files. Rebuild the app to activate them."
      : "Verified the complete demo. No files written; use --write to publish.",
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(
      String(error.shortMessage ?? error.message)
        .replace(/https?:\/\/[^\s)]+/g, "<rpc>")
        .slice(0, 700),
    );
    process.exitCode = 1;
  });
