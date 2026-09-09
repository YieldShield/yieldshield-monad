#!/usr/bin/env node
/** One-time, bounded, resumable Sepolia demo deployment. Default prepares only. */
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseEther,
  parseEventLogs,
  zeroAddress,
  zeroHash,
  toHex,
  encodeDeployData,
  getContractAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  ROOT,
  SequentialDeployment,
  atomicJson,
  acquireDeploymentLock,
  assertRuntimeMatches,
  readCanonicalReceipt,
  linkBytecode,
} from "./deploy-base-sepolia.mjs";

export const DEMO_KIND = "base-sepolia-continuous-demo-v1";
export const DEMO_CHAIN = 84532;
export const DEPLOYER = "0xA437345Be29EC6802024A8e090E34b621b92E5E2";
export const MIGRATION_RECIPIENT = "0xfa9605A2c38a0B4f16f689FDD07B63F295b86d1C";
export const DEMO_ASSETS = [
  { sourceSymbol: "AAPLc", name: "Apple", basePrice: 10000000000n },
  { sourceSymbol: "NVDAc", name: "NVIDIA", basePrice: 15000000000n },
  { sourceSymbol: "METAc", name: "Meta", basePrice: 20000000000n },
  { sourceSymbol: "GOOGLc", name: "Alphabet", basePrice: 12500000000n },
  { sourceSymbol: "USDC", name: "Test USDC", basePrice: 100000000n },
];
const stringify = (value) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n";
const sha = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : stringify(value))
    .digest("hex");
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export function demoArtifact(name) {
  const a = JSON.parse(readFileSync(resolve(ROOT, `contracts/out/${name}.sol/${name}.json`), "utf8"));
  for (const [source, metadata] of Object.entries(a.metadata.sources))
    assert.equal(
      keccak256(readFileSync(resolve(ROOT, "contracts", source))),
      metadata.keccak256,
      `Stale artifact ${name}: rebuild first`,
    );
  return a;
}
export function inheritedNames(original, modules) {
  const names = [
    "Timelock",
    "YSToken",
    "Governor",
    "TokenWhitelistLib",
    "PoolCreationLib",
    "PoolValidationLib",
    "BaseFactoryRouter",
    ...Object.values(modules).flatMap((config) => Object.values(config.modules).map((group) => group.contract)),
  ];
  for (const name of names) assert(original.contracts[name], `Missing inherited ${name}`);
  return [...new Set(names)];
}
export function initialDemoManifest(original, modules) {
  assert.equal(original.chainId, DEMO_CHAIN);
  assert(same(original.deployer, DEPLOYER));
  const names = inheritedNames(original, modules);
  return {
    schemaVersion: 2,
    deploymentKind: DEMO_KIND,
    chainId: DEMO_CHAIN,
    deployer: DEPLOYER,
    status: "preparing",
    contracts: Object.fromEntries(names.map((name) => [name, original.contracts[name]])),
    transactions: Object.fromEntries(names.map((name) => [`deploy:${name}`, original.transactions[`deploy:${name}`]])),
    assets: [],
    pools: [],
    inheritedFrom: "base-sepolia-alpha.json",
    inheritedContracts: names,
  };
}
export function demoEnvironment() {
  const path = resolve(ROOT, "contracts/.env.base.local");
  assert(existsSync(path), "Missing dedicated testnet deployer configuration");
  execFileSync("git", ["check-ignore", "--quiet", path], { cwd: ROOT, stdio: "ignore" });
  assert.equal(statSync(path).mode & 0o077, 0, "Deployer configuration permissions must exclude other users");
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) {
      let v = match[2].trim();
      if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
      values[match[1]] = v;
    }
  }
  return { ...values, ...process.env };
}
export async function verifyDemoArtifacts(client, manifest) {
  assert.equal(await client.getChainId(), DEMO_CHAIN, "Only Base Sepolia is permitted");
  const links = {};
  for (const record of Object.values(manifest.contracts))
    for (const [file, libraries] of Object.entries({
      ...demoArtifact(record.artifact).bytecode.linkReferences,
      ...demoArtifact(record.artifact).deployedBytecode.linkReferences,
    }))
      for (const name of Object.keys(libraries)) {
        assert(manifest.contracts[name], `Missing reviewed library ${name}`);
        links[`${file}:${name}`] = manifest.contracts[name].address;
      }
  const entries = Object.entries(manifest.contracts);
  for (let i = 0; i < entries.length; i += 5)
    await Promise.all(
      entries.slice(i, i + 5).map(async ([name, record]) => {
        const code = await client.getCode({ address: record.address });
        assert(code && code !== "0x", `${name}: missing code`);
        assert.equal(keccak256(code), record.runtimeCodehash, `${name}: runtime changed`);
        assertRuntimeMatches(demoArtifact(record.artifact), code, record.address, links);
        const tx = manifest.transactions[`deploy:${name}`];
        assert(tx && tx.status === "confirmed" && same(tx.hash, record.txHash), `${name}: deployment receipt missing`);
        const receipt = await readCanonicalReceipt(client, tx.hash, name);
        assert(same(receipt.contractAddress, record.address), `${name}: wrong creation target`);
        const transaction = await client.getTransaction({ hash: tx.hash });
        assert(
          same(transaction.from, DEPLOYER) && transaction.to === null && transaction.value === 0n,
          `${name}: wrong deployment provenance`,
        );
        const a = demoArtifact(record.artifact),
          expectedData = encodeDeployData({
            abi: a.abi,
            bytecode: linkBytecode(a.bytecode.object, a.bytecode.linkReferences, links),
            args: record.constructorArguments,
          });
        assert(same(transaction.input, expectedData), `${name}: constructor calldata differs from reviewed artifact`);
        assert(
          same(getContractAddress({ from: DEPLOYER, nonce: BigInt(transaction.nonce) }), record.address),
          `${name}: deployment nonce/address mismatch`,
        );
      }),
    );
  return links;
}

export async function verifyDemoWiring(client, manifest, { allowPreparing = false } = {}) {
  assert.equal(await client.getChainId(), DEMO_CHAIN);
  assert.equal(manifest.deploymentKind, DEMO_KIND);
  const modules = JSON.parse(readFileSync(resolve(ROOT, "contracts/config/base-modules.json"), "utf8"));
  const original = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/base-sepolia-alpha.json"), "utf8"));
  const expectedInherited = inheritedNames(original, modules);
  assert.deepEqual([...manifest.inheritedContracts].sort(), expectedInherited.sort(), "Inherited inventory changed");
  for (const name of expectedInherited) {
    assert.deepEqual(manifest.contracts[name], original.contracts[name], `Inherited ${name} record changed`);
    assert.deepEqual(
      manifest.transactions[`deploy:${name}`],
      original.transactions[`deploy:${name}`],
      `Inherited ${name} receipt changed`,
    );
  }
  const c = (name) => {
    assert(manifest.contracts[name], `Missing ${name}`);
    return manifest.contracts[name].address;
  };
  const read = (target, artifact, functionName, args = []) =>
    client.readContract({ address: target, abi: demoArtifact(artifact).abi, functionName, args });
  const expect = async (target, artifact, method, args, expected) =>
    assert.deepEqual(
      await read(target, artifact, method, args),
      expected,
      `${artifact}.${method} configuration mismatch`,
    );
  const timelock = c("Timelock");
  await expect(timelock, "YSTimelockController", "getMinDelay", [], 172800n);
  for (const role of [
    zeroHash,
    ...["PROPOSER_ROLE", "EXECUTOR_ROLE", "CANCELLER_ROLE"].map((name) => keccak256(toHex(name))),
  ]) {
    await expect(timelock, "YSTimelockController", "getRoleMemberCount", [role], 1n);
    assert(
      same(
        await read(timelock, "YSTimelockController", "getRoleMember", [role, 0n]),
        role === zeroHash ? timelock : c("Governor"),
      ),
      "Unexpected governance role member",
    );
  }
  for (const config of Object.values(modules)) {
    if (!manifest.contracts[config.router]) {
      assert(allowPreparing, "Missing demo router");
      continue;
    }
    const router = c(config.router),
      requests = [];
    for (const [groupName, group] of Object.entries(config.modules)) {
      const target =
        group.contract === "BasePoolInitializeModule" && config.router === "BasePoolRouter"
          ? c("AlphaPoolInitializeModule")
          : c(group.contract);
      requests.push(() => expect(router, config.router, `${groupName.toLowerCase()}Module`, [], getAddress(target)));
      for (const [signature, selector] of Object.entries(config.selectors))
        if (
          group.entryPoints.includes(signature.slice(0, signature.indexOf("("))) &&
          !["proxiableUUID()", "upgradeToAndCall(address,bytes)"].includes(signature)
        )
          requests.push(() =>
            expect(router, config.router, "moduleForSelector", ["0x" + selector], getAddress(target)),
          );
    }
    for (let i = 0; i < requests.length; i += 20)
      await Promise.all(requests.slice(i, i + 20).map((request) => request()));
  }
  if (manifest.contracts.AlphaPoolInitializeModule) {
    await expect(
      c("AlphaPoolInitializeModule"),
      "AlphaPoolInitializeModule",
      "originalModule",
      [],
      getAddress(c("BasePoolInitializeModule")),
    );
    await expect(
      c("AlphaPoolInitializeModule"),
      "AlphaPoolInitializeModule",
      "originalModuleCodeHash",
      [],
      manifest.contracts.BasePoolInitializeModule.runtimeCodehash,
    );
  }
  if (allowPreparing && manifest.status !== "complete") return;
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.pools.length, 4);
  await expect(c("Factory"), "SplitRiskPoolFactory", "owner", [], getAddress(timelock));
  await expect(c("Factory"), "SplitRiskPoolFactory", "governanceTimelock", [], getAddress(timelock));
  await expect(c("Factory"), "SplitRiskPoolFactory", "bootstrapModeEnabled", [], false);
  await expect(c("Factory"), "SplitRiskPoolFactory", "compositeOracle", [], getAddress(c("CompositeOracle")));
  await expect(c("CompositeOracle"), "CompositeOracle", "owner", [], getAddress(c("Factory")));
  await expect(c("Faucet"), "ConfigurableTokenFaucet", "owner", [], getAddress(timelock));
  const slot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  for (const [target, implementation] of [
    [c("Factory"), c("BaseFactoryRouter")],
    ...manifest.pools.map((pool) => [pool.address, c("BasePoolRouter")]),
  ]) {
    const stored = await client.getStorageAt({ address: target, slot });
    assert(same("0x" + stored.slice(-40), implementation), "Proxy implementation mismatch");
  }
  for (const pool of manifest.pools) {
    const receipt = await readCanonicalReceipt(
      client,
      manifest.transactions[`pool:create:${pool.symbol}`].hash,
      pool.symbol,
    );
    const logs = parseEventLogs({
      abi: demoArtifact("SplitRiskPoolFactory").abi,
      logs: receipt.logs,
      eventName: "PoolCreated",
      strict: true,
    }).filter(
      (log) =>
        same(log.address, c("Factory")) &&
        same(log.args.poolAddress, pool.address) &&
        same(log.args.shieldedToken, pool.shieldedToken) &&
        same(log.args.backingToken, pool.backingToken) &&
        same(log.args.creator, DEPLOYER),
    );
    assert.equal(logs.length, 1, "Pool provenance mismatch");
    const config = await read(pool.address, "SplitRiskPool", "poolConfig");
    assert.equal(config[5], 60n);
    assert.equal(config[6], 120n);
  }
  const newTransactions = Object.entries(manifest.transactions).filter(
    ([id]) => !manifest.inheritedContracts.some((name) => id === `deploy:${name}`),
  );
  for (let i = 0; i < newTransactions.length; i += 5)
    await Promise.all(
      newTransactions.slice(i, i + 5).map(async ([id, record]) => {
        const tx = await client.getTransaction({ hash: record.hash });
        assert(
          same(tx.from, DEPLOYER) &&
            same(tx.input, record.request.data) &&
            tx.value === 0n &&
            tx.nonce === record.request.nonce &&
            ((tx.to === null && record.request.to == null) || same(tx.to, record.request.to)),
          `${id}: transaction intent mismatch`,
        );
        await readCanonicalReceipt(client, record.hash, id);
      }),
    );
}

/** Verify delivery events, not an unspent wallet balance; a prior public claim is valid. */
export async function verifyStarterDelivery(client, manifest, migrationReceipt) {
  const faucet = manifest.contracts.Faucet.address;
  const start = BigInt(manifest.transactions["deploy:Faucet"].receipt.blockNumber);
  const found = new Map(),
    checked = new Set();
  const inspect = async (hash) => {
    if (checked.has(hash)) return;
    checked.add(hash);
    const receipt = await readCanonicalReceipt(client, hash, "starter delivery");
    if (receipt.blockNumber < start || receipt.blockNumber > migrationReceipt.blockNumber) return;
    for (const log of parseEventLogs({
      abi: demoArtifact("ConfigurableTokenFaucet").abi,
      logs: receipt.logs,
      eventName: "TokensDripped",
      strict: true,
    })) {
      if (!same(log.address, faucet) || !same(log.args.recipient, MIGRATION_RECIPIENT)) continue;
      const asset = manifest.assets.find((asset) => same(asset.testToken, log.args.token));
      if (asset && log.args.amount === (asset.isEquity ? 25n : 10000n) * 10n ** BigInt(asset.decimals))
        found.set(asset.symbol, { symbol: asset.symbol, txHash: hash, blockNumber: receipt.blockNumber.toString() });
    }
  };
  await inspect(migrationReceipt.transactionHash);
  for (const delivery of manifest.migrationDelivery ?? []) await inspect(delivery.txHash);
  const event = demoArtifact("ConfigurableTokenFaucet").abi.find(
    (entry) => entry.type === "event" && entry.name === "TokensDripped",
  );
  for (let end = migrationReceipt.blockNumber; found.size < manifest.assets.length && end >= start;) {
    const from = end - start >= 1999n ? end - 1999n : start;
    const logs = await client.getLogs({
      address: faucet,
      event,
      args: { recipient: MIGRATION_RECIPIENT },
      fromBlock: from,
      toBlock: end,
      strict: true,
    });
    for (const log of [...logs].reverse()) {
      await inspect(log.transactionHash);
      if (found.size === manifest.assets.length) break;
    }
    if (from === start) break;
    end = from - 1n;
  }
  for (const asset of manifest.assets)
    assert(found.has(asset.symbol), `No canonical starter delivery for ${asset.symbol}`);
  return [...found.values()];
}

export async function main() {
  const args = new Set(process.argv.slice(2));
  assert(
    [...args].every((a) => ["--prepare", "--broadcast"].includes(a)),
    "Unknown argument",
  );
  assert(!(args.has("--prepare") && args.has("--broadcast")), "Choose prepare or broadcast");
  const broadcast = args.has("--broadcast"),
    env = demoEnvironment();
  const account = privateKeyToAccount(env.BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY);
  assert(same(account.address, DEPLOYER), "Wrong dedicated deployer");
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com", {
      retryCount: 2,
      timeout: 20000,
      batch: { batchSize: 20, wait: 20 },
    }),
  });
  assert.equal(await client.getChainId(), DEMO_CHAIN, "Wrong deployment chain");
  const release = broadcast
    ? acquireDeploymentLock(resolve(ROOT, "contracts/.base-sepolia-deployment.lock"))
    : () => {};
  process.once("exit", release);
  process.once("SIGINT", () => {
    release();
    process.exit(130);
  });
  try {
    const original = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/base-sepolia-alpha.json"), "utf8"));
    const modules = JSON.parse(readFileSync(resolve(ROOT, "contracts/config/base-modules.json"), "utf8"));
    const path = resolve(ROOT, "contracts/deployments/base-sepolia-demo-v1.json");
    const manifest = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : initialDemoManifest(original, modules);
    assert.equal(manifest.deploymentKind, DEMO_KIND);
    assert.equal(manifest.chainId, DEMO_CHAIN);
    assert(same(manifest.deployer, account.address));
    if (manifest.status === "complete") {
      await verifyDemoArtifacts(client, manifest);
      await verifyDemoWiring(client, manifest);
      console.log("Demo is already complete; no transactions submitted.");
      return;
    }
    const recipeHash = sha({
      script: sha(readFileSync(fileURLToPath(import.meta.url), "utf8")),
      modules,
      assets: DEMO_ASSETS,
      cycleSeconds: 7200,
      minimumPoolTime: 60,
      unlockDuration: 120,
      migrationRecipient: MIGRATION_RECIPIENT,
    });
    if (manifest.recipeHash)
      assert.equal(manifest.recipeHash, recipeHash, "Demo deployment recipe changed; stop and review");
    manifest.recipeHash = recipeHash;
    const links = await verifyDemoArtifacts(client, manifest);
    await verifyDemoWiring(client, manifest, { allowPreparing: true });
    // The execution-gas cap is separate from Base L1 data fees. Preserve a 0.0001 ETH
    // balance reserve for those fees; the one-time runner records exact receipts.
    manifest.feePolicy = {
      maximumExecutionGasWei: parseEther("0.005").toString(),
      minimumL1FeeBalanceReserveWei: parseEther("0.0001").toString(),
      includesL1Fees: false,
    };
    const run = new SequentialDeployment({
      client,
      account,
      broadcast,
      manifestPath: path,
      manifest,
      nonce: await client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      maxFeePerGas: 100000000n,
      spendLimit: parseEther("0.005"),
    });
    run.links = links;
    const inherited = (name) => manifest.contracts[name].address;
    const timelock = inherited("Timelock");
    await run.expect(timelock, "YSTimelockController", "getMinDelay", [], 172800n);
    const initializer = await run.deploy("AlphaPoolInitializeModule", "AlphaPoolInitializeModule", [
      inherited("BasePoolInitializeModule"),
    ]);
    const poolRouter = await run.deploy(
      "BasePoolRouter",
      "BasePoolRouter",
      Object.values(modules.SplitRiskPool.modules).map((group) =>
        group.contract === "BasePoolInitializeModule" ? initializer : inherited(group.contract),
      ),
    );
    const factory = await run.deploy("Factory", "ERC1967Proxy", [
      inherited("BaseFactoryRouter"),
      encodeFunctionData({
        abi: demoArtifact("SplitRiskPoolFactory").abi,
        functionName: "initialize",
        args: [account.address, timelock, poolRouter],
      }),
    ]);
    const assets = [];
    for (const asset of DEMO_ASSETS) {
      const equity = asset.sourceSymbol !== "USDC",
        decimals = equity ? 8 : 6,
        symbol = equity ? `t${asset.sourceSymbol}` : "TestUSDC";
      const token = await run.deploy(`Token:${asset.sourceSymbol}`, "BaseSepoliaAlphaToken", [
        `Demo ${asset.name} (Base Sepolia)`,
        symbol,
        decimals,
        10000000n * 10n ** BigInt(decimals),
        account.address,
      ]);
      assets.push({
        ...asset,
        basePrice: asset.basePrice.toString(),
        symbol,
        testToken: token,
        decimals,
        isEquity: equity,
      });
    }
    manifest.assets = assets;
    run.save();
    const usdc = assets[4];
    const oracle = await run.deploy("DemoOracle", "AlphaScenarioOracle", [
      usdc.testToken,
      assets.filter((a) => a.isEquity).map((a) => a.testToken),
      DEMO_ASSETS.filter((a) => a.sourceSymbol !== "USDC").map((a) => a.basePrice),
      7200,
    ]);
    const exchange = await run.deploy("DemoExchange", "AlphaStockExchange", [oracle]);
    const composite = await run.deploy("CompositeOracle");
    const faucet = await run.deploy("Faucet", "ConfigurableTokenFaucet", [account.address]);
    manifest.pricing = {
      kind: "deterministic-demo",
      oracle,
      exchange,
      cycleSeconds: 7200,
      basePrices: Object.fromEntries(
        DEMO_ASSETS.filter((a) => a.sourceSymbol !== "USDC").map((a) => [a.sourceSymbol, a.basePrice.toString()]),
      ),
    };
    run.save();
    await run.write("composite:factory-ownership", composite, "CompositeOracle", "transferOwnership", [factory]);
    await run.write("factory:composite", factory, "SplitRiskPoolFactory", "setCompositeOracle", [composite]);
    await run.write("factory:fee-recipient", factory, "SplitRiskPoolFactory", "setDefaultProtocolFeeRecipient", [
      timelock,
    ]);
    for (const asset of assets)
      await run.write(`factory:whitelist:${asset.symbol}`, factory, "SplitRiskPoolFactory", "addTokenInitial", [
        asset.testToken,
        asset.name,
        asset.symbol,
        oracle,
        zeroAddress,
        10000n,
        true,
      ]);
    await run.write("factory:strict-usdc", factory, "SplitRiskPoolFactory", "setTokenRequiresStrictProtectedPrice", [
      usdc.testToken,
      true,
    ]);
    await run.write("factory:finalize-bootstrap", factory, "SplitRiskPoolFactory", "finalizeBootstrap");
    await run.write("ownership:factory", factory, "SplitRiskPoolFactory", "transferOwnership", [timelock]);
    await run.expect(factory, "SplitRiskPoolFactory", "bootstrapModeEnabled", [], false);
    for (const asset of assets.filter((a) => a.isEquity)) {
      const bond = 1000n * 10n ** 6n;
      await run.write(`approve:factory:${asset.symbol}`, usdc.testToken, "BaseSepoliaAlphaToken", "approve", [
        factory,
        bond,
      ]);
      const receipt = await run.write(`pool:create:${asset.symbol}`, factory, "SplitRiskPoolFactory", "createPool", [
        asset.testToken,
        asset.symbol,
        usdc.testToken,
        usdc.symbol,
        1000n,
        100n,
        15000n,
        bond,
      ]);
      let pool;
      if (broadcast) {
        const logs = parseEventLogs({
          abi: demoArtifact("SplitRiskPoolFactory").abi,
          logs: receipt.logs,
          eventName: "PoolCreated",
          strict: true,
        }).filter((log) => same(log.address, factory));
        assert.equal(logs.length, 1);
        pool = logs[0].args.poolAddress;
        assert(
          same(logs[0].args.shieldedToken, asset.testToken) &&
            same(logs[0].args.backingToken, usdc.testToken) &&
            same(logs[0].args.creator, account.address),
          "Pool creation identity mismatch",
        );
      } else pool = getAddress("0x" + sha(`demo-plan:${asset.symbol}`).slice(0, 40));
      const previous = manifest.pools.find((p) => p.symbol === asset.symbol);
      if (previous) assert(same(previous.address, pool));
      else
        manifest.pools.push({
          symbol: asset.symbol,
          address: pool,
          shieldedToken: asset.testToken,
          backingToken: usdc.testToken,
        });
      run.save();
      await run.write(`approve:backing:${asset.symbol}`, usdc.testToken, "BaseSepoliaAlphaToken", "approve", [
        pool,
        50000n * 10n ** 6n,
      ]);
      await run.write(`seed:backing:${asset.symbol}`, pool, "SplitRiskPool", "depositBackingAsset", [
        usdc.testToken,
        50000n * 10n ** 6n,
        50000n * 10n ** 6n,
      ]);
      await run.expect(pool, "SplitRiskPool", "POOL_FACTORY", [], factory);
      await run.expect(pool, "SplitRiskPool", "owner", [], factory);
      await run.expect(pool, "SplitRiskPool", "governanceTimelock", [], timelock);
      await run.expect(pool, "SplitRiskPool", "requiresStrictProtectedBackingPrice", [], true);
      if (broadcast) {
        const config = await run.read(pool, "SplitRiskPool", "poolConfig");
        assert.equal(config[5], 60n, "Demo protected exit delay mismatch");
        assert.equal(config[6], 120n, "Demo collateral delay mismatch");
      }
    }
    for (const asset of assets) {
      const scale = 10n ** BigInt(asset.decimals);
      await run.write(`exchange:fund:${asset.symbol}`, asset.testToken, "BaseSepoliaAlphaToken", "transfer", [
        exchange,
        (asset.isEquity ? 100000n : 2000000n) * scale,
      ]);
      await run.write(`faucet:fund:${asset.symbol}`, asset.testToken, "BaseSepoliaAlphaToken", "transfer", [
        faucet,
        (asset.isEquity ? 100000n : 5000000n) * scale,
      ]);
    }
    await run.write("faucet:configure", faucet, "ConfigurableTokenFaucet", "setTokens", [
      assets.map((a) => a.testToken),
      assets.map((a) => (a.isEquity ? 25n : 10000n) * 10n ** BigInt(a.decimals)),
    ]);
    await run.write("ownership:faucet", faucet, "ConfigurableTokenFaucet", "transferOwnership", [timelock]);
    const migrationReceipt = await run.write("migration:starter-basket", faucet, "ConfigurableTokenFaucet", "dripAll", [
      MIGRATION_RECIPIENT,
    ]);
    if (broadcast) {
      manifest.migrationDelivery = await verifyStarterDelivery(client, manifest, migrationReceipt);
      run.save();
    }
    if (broadcast) {
      await run.expect(factory, "SplitRiskPoolFactory", "owner", [], timelock);
      await run.expect(composite, "CompositeOracle", "owner", [], factory);
      await run.expect(faucet, "ConfigurableTokenFaucet", "owner", [], timelock);
      manifest.status = "complete";
      manifest.completedAt = new Date().toISOString();
      manifest.migration = {
        recipient: MIGRATION_RECIPIENT,
        txHash: manifest.transactions["migration:starter-basket"].hash,
      };
      run.save();
      await verifyDemoArtifacts(client, manifest);
      await verifyDemoWiring(client, manifest);
      console.log(
        `Verified continuous Sepolia demo: ${manifest.pools.length} funded pools; no recurring signer enabled.`,
      );
    } else {
      atomicJson(resolve(ROOT, "contracts/deployments/base-sepolia-demo-plan.json"), {
        mode: "prepare-only",
        chainId: DEMO_CHAIN,
        deployer: DEPLOYER,
        recipeHash,
        assets,
        steps: run.plan,
        note: "No signatures or broadcasts. Pool addresses are placeholders until confirmed PoolCreated events. Synthetic prices and valueless tokens only.",
      });
      console.log(`Prepared ${run.plan.length} bounded demo deployment steps without signing.`);
    }
  } finally {
    release();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    const message = String(error.shortMessage ?? error.message ?? "Deployment stopped")
      .replace(/0x[0-9a-fA-F]{64}/g, "<hash>")
      .replace(/https?:\/\/[^\s)]+/g, "<rpc>")
      .slice(0, 700);
    console.error(`Demo deployment: ${error.name ?? "Error"}: ${message}`);
    process.exitCode = 1;
  });
