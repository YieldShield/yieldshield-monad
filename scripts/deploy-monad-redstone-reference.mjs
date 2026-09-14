import { deploymentAssets } from "./monad-assets.mjs";
/** Activates a distinct reference-price factory only with a fresh verified RedStone push-feed round. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseEventLogs,
  parseAbi,
  parseEther,
  zeroAddress,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { ROOT, SequentialDeployment, loadEnv, artifact, acquireDeploymentLock } from "./monad-deployment-lib.mjs";
const env = loadEnv();
assert(process.argv.includes("--broadcast"), "Reference activation requires --broadcast");
assert(
  process.argv.slice(2).every((arg) => arg === "--broadcast"),
  "Unknown option",
);
const config = JSON.parse(readFileSync(resolve(ROOT, "config/monad.json"))),
  path = resolve(ROOT, "contracts/deployments/monad-testnet.json");
const manifest = JSON.parse(readFileSync(path));
assert(["scenario-complete", "complete"].includes(manifest.status), "Finish the scenario deployment first");
const client = createPublicClient({
  chain: monadTestnet,
  transport: http(env.MONAD_RPC_URL || config.rpcUrl, { timeout: 20000, retryCount: 2 }),
  pollingInterval: 1000,
});
assert.equal(await client.getChainId(), 10143);
const account = privateKeyToAccount(env.MONAD_DEPLOYER_PRIVATE_KEY);
assert.equal(account.address, manifest.deployer);
const release = acquireDeploymentLock(resolve(ROOT, "contracts/.monad-deployment.lock"));
process.once("exit", release);
const run = new SequentialDeployment({
  client,
  account,
  broadcast: true,
  manifestPath: path,
  manifest,
  nonce: await client.getTransactionCount({ address: account.address }),
  maxFeePerGas: 200000000000n,
  spendLimit: parseEther("19.8"),
});
const c = (n) => manifest.contracts[n].address;
async function refresh() {
  const mon = await run.read(c("RedstoneReferenceFeed"), "MonadRedstoneReferenceFeed", "getPrice", [c("WMON")]);
  assert(mon > 0n, "Strict MON reference unavailable");
}
try {
  assert(
    !manifest.referenceOracle || manifest.referenceOracle === "redstone",
    "Review the active reference oracle before migration",
  );
  const sourceCode = await client.getCode({ address: config.redstone.address });
  assert(
    sourceCode && keccak256(sourceCode) === config.redstone.runtimeCodehash,
    "RedStone source runtime changed; review its identity",
  );
  await run.deploy("RedstoneReferenceFeed", "MonadRedstoneReferenceFeed", [
    config.redstone.address,
    c("WMON"),
    config.externalTokens.shMON,
    c("TestUSDC"),
  ]);
  manifest.referenceOracle = "redstone";
  manifest.assets = deploymentAssets(manifest, config);
  run.save();
  await refresh();
  const factory = await run.deploy("ReferenceFactory", "ERC1967Proxy", [
    c("BaseFactoryRouter"),
    encodeFunctionData({
      abi: artifact("SplitRiskPoolFactory").abi,
      functionName: "initialize",
      args: [account.address, c("Timelock"), c("BasePoolRouter")],
    }),
  ]);
  const composite = await run.deploy("ReferenceCompositeOracle", "CompositeOracle");
  await run.write("reference:composite-owner", composite, "CompositeOracle", "transferOwnership", [factory]);
  await run.write("reference:factory-oracle", factory, "SplitRiskPoolFactory", "setCompositeOracle", [composite]);
  await run.write("reference:fee-recipient", factory, "SplitRiskPoolFactory", "setDefaultProtocolFeeRecipient", [
    c("Timelock"),
  ]);
  const usd = manifest.assets.find((a) => a.id === "test-usd"),
    wmon = manifest.assets.find((a) => a.id === "wmon"),
    shmon = manifest.assets.find((a) => a.id === "shmon"),
    vault = manifest.assets.find((a) => a.id === "test-usd-vault");
  for (const token of [usd, wmon, shmon, vault]) {
    await refresh();
    await run.write(`reference:whitelist:${token.id}`, factory, "SplitRiskPoolFactory", "addTokenInitial", [
      token.address,
      token.name,
      token.symbol,
      token.id === "test-usd-vault" ? c("VaultBackingFeed") : c("RedstoneReferenceFeed"),
      zeroAddress,
      10000n,
      true,
    ]);
  }
  for (const token of [usd, vault])
    await run.write(
      `reference:strict:${token.id}`,
      factory,
      "SplitRiskPoolFactory",
      "setTokenRequiresStrictProtectedPrice",
      [token.address, true],
    );
  await run.write("reference:finalize", factory, "SplitRiskPoolFactory", "finalizeBootstrap");
  await run.write("reference:governance", factory, "SplitRiskPoolFactory", "transferOwnership", [c("Timelock")]);
  for (const [id, token, backing] of [
    ["wmon-usd", wmon, usd],
    ["shmon-usd", shmon, usd],
    ["wmon-vault", wmon, vault],
  ]) {
    await refresh();
    await run.write(`reference:${id}:bond`, backing.address, backing.artifact, "approve", [factory, 1000n * 10n ** 6n]);
    const receipt = await run.write(`reference:${id}:create`, factory, "SplitRiskPoolFactory", "createPool", [
      token.address,
      token.symbol,
      backing.address,
      backing.symbol,
      1000n,
      100n,
      15000n,
      1000n * 10n ** 6n,
    ]);
    const logs = parseEventLogs({
      abi: artifact("SplitRiskPoolFactory").abi,
      logs: receipt.logs,
      eventName: "PoolCreated",
      strict: true,
    }).filter((e) => e.address.toLowerCase() === factory.toLowerCase());
    assert.equal(logs.length, 1);
    const pool = logs[0].args.poolAddress;
    const prior = manifest.pools.find((p) => p.id === id);
    if (prior) assert.equal(prior.address.toLowerCase(), pool.toLowerCase());
    else
      manifest.pools.push({
        id,
        address: pool,
        shieldedToken: token.address,
        backingToken: backing.address,
        symbol: token.symbol,
        backingSymbol: backing.symbol,
        environment: "reference",
        priceKind: token.kind,
        createdTx: receipt.transactionHash,
      });
    run.save();
    await run.write(`reference:${id}:approve-seed`, backing.address, backing.artifact, "approve", [
      pool,
      50000n * 10n ** 6n,
    ]);
    await refresh();
    await run.write(`reference:${id}:seed`, pool, "SplitRiskPool", "depositBackingAsset", [
      backing.address,
      50000n * 10n ** 6n,
      50000n * 10n ** 6n,
    ]);
    await run.expect(pool, "SplitRiskPool", "POOL_FACTORY", [], factory);
    await run.expect(pool, "SplitRiskPool", "requiresStrictProtectedBackingPrice", [], true);
  }
  manifest.status = "complete";
  manifest.referenceStatus = "active";
  manifest.feePolicy.maximumTotalTestMon = "19.8";
  manifest.referenceCompletedAt = new Date().toISOString();
  run.save();
  console.log("Three funded Monad reference-price markets activated.");
} finally {
  release();
}
