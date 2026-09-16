/** Separate, resumable testnet expansion; preserves all existing pool implementations. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  http,
  parseEther,
  parseAbi,
  encodeFunctionData,
  parseEventLogs,
  keccak256,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import {
  ROOT,
  SequentialDeployment,
  loadEnv,
  artifact,
  atomicJson,
  acquireDeploymentLock,
} from "./monad-deployment-lib.mjs";
import { throttledRpcFetch } from "../services/monad/rpc-throttle.mjs";
import { deploymentAssets } from "./monad-assets.mjs";
const broadcast = process.argv.includes("--broadcast");
assert(
  process.argv.slice(2).every((a) => ["--broadcast", "--check"].includes(a)),
  "Unknown option",
);
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p)));
const base = read("contracts/deployments/monad-testnet.json"),
  expansion = read("config/expanded-assets.json"),
  network = read("config/monad.json");
const client = createPublicClient({
  chain: monadTestnet,
  transport: http(network.rpcUrl, { fetchFn: throttledRpcFetch({ limit: 4 }), timeout: 20000 }),
  pollingInterval: 1000,
});
assert.equal(await client.getChainId(), 10143);
const account = privateKeyToAccount(loadEnv().MONAD_DEPLOYER_PRIVATE_KEY);
assert.equal(account.address, base.deployer);
const erc20 = parseAbi([
  "function balanceOf(address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
  "function transfer(address,uint256) returns(bool)",
  "function deposit() payable",
  "function withdraw(uint256)",
]);
const faucetAbi = parseAbi([
  "function requestFunds(address)",
  "function token() view returns(address)",
  "function faucetDripAmount() view returns(uint256)",
  "function maxDripFrequency() view returns(uint256)",
  "function lastDripTimestamp() view returns(uint256)",
]);
for (const token of [...expansion.assets, expansion.faucet]) {
  assert.equal(
    keccak256(await client.getCode({ address: token.address })),
    token.runtimeCodehash,
    "External code changed",
  );
  if (token.implementation) {
    const i = token.implementation;
    const slot = await client.getStorageAt({ address: token.address, slot: i.slot });
    assert.equal("0x" + slot.slice(-40), i.address.toLowerCase());
    assert.equal(keccak256(await client.getCode({ address: i.address })), i.runtimeCodehash);
  }
}
const ausd = expansion.assets.find((a) => a.id === "agora-ausd"),
  wrapped = expansion.assets.find((a) => a.id === "canonical-wmon");
assert.equal(
  (
    await client.readContract({ address: expansion.faucet.address, abi: faucetAbi, functionName: "token" })
  ).toLowerCase(),
  ausd.address.toLowerCase(),
);
const balance = await client.getBalance({ address: account.address });
await client.simulateContract({
  account,
  address: wrapped.address,
  abi: erc20,
  functionName: "deposit",
  value: parseEther("0.01"),
});
console.log(
  JSON.stringify({
    chainId: 10143,
    deployer: account.address,
    testMon: String(balance),
    newContracts: 5,
    maximumTestMon: "6",
    assets: expansion.assets.map((a) => a.id),
    broadcast,
  }),
);
if (!broadcast) process.exit(0);
const release = acquireDeploymentLock(resolve(ROOT, "contracts/.monad-deployment.lock"));
process.once("exit", release);
const path = resolve(ROOT, "contracts/deployments/monad-expansion-v2.json");
const manifest = existsSync(path)
  ? JSON.parse(readFileSync(path))
  : {
      chainId: 10143,
      deployer: account.address,
      contracts: { ...base.contracts },
      transactions: {},
      pools: [],
      status: "expansion-in-progress",
    };
const reviewed = read("docs/evidence/expansion-continuation-review.json");
for (const [id, saved] of Object.entries(reviewed.confirmedIntents)) {
  const current = manifest.transactions[id];
  assert.equal(current?.intentHash, saved.intentHash, `Existing intent changed: ${id}`);
  assert.equal(current?.hash, saved.hash, `Existing hash changed: ${id}`);
  assert.equal(current?.request.nonce, saved.nonce, `Existing nonce changed: ${id}`);
}
assert(
  !Object.keys(manifest.transactions).some((id) => id.includes("monad-wmon") || id.includes("canonical-wmon")),
  "Reconcile any unexpected canonical WMON transaction before continuing",
);
const run = new SequentialDeployment({
  client,
  account,
  broadcast: true,
  manifestPath: path,
  manifest,
  nonce: await client.getTransactionCount({ address: account.address }),
  maxFeePerGas: 200000000000n,
  // Five additional test MON confirmed on 16 September. Keep historical costs
  // in this cumulative cap; every saved intent/hash remains unchanged.
  spendLimit: parseEther("6"),
});
const c = (n) => manifest.contracts[n].address;
const call = (id, address, abi, functionName, args = [], value = 0n) =>
  run.transaction("expansion:" + id, { to: address, data: encodeFunctionData({ abi, functionName, args }), value });
try {
  const cfg = [
    [c("WMON"), c("RedstoneReferenceFeed"), c("WMON"), 1],
    [network.externalTokens.shMON, c("RedstoneReferenceFeed"), network.externalTokens.shMON, 1],
    [wrapped.address, c("RedstoneReferenceFeed"), c("WMON"), 1],
    [c("TestUSDC"), c("RedstoneReferenceFeed"), c("TestUSDC"), 2],
    [c("TestUSDVault"), c("VaultBackingFeed"), c("TestUSDVault"), 2],
    [ausd.address, zeroAddress, zeroAddress, 2],
  ].map(([token, source, referenceToken, roles]) => ({ token, source, referenceToken, roles }));
  const price = await run.deploy("ExpandedAssetRegistry", "MonadAssetRegistry", [cfg]);
  const initializer = await run.deploy("ExpandedInitializeModule", "MonadExpandedInitializeModule", [
    c("BasePoolInitializeModule"),
    price,
  ]);
  const moduleConfig = read("contracts/config/base-modules.json").SplitRiskPool;
  const targets = Object.values(moduleConfig.modules).map((v) =>
    v.contract === "BasePoolInitializeModule" ? initializer : c(v.contract),
  );
  const router = await run.deploy("ExpandedPoolRouter", "BasePoolRouter", targets);
  const factory = await run.deploy("ExpandedFactory", "ERC1967Proxy", [
    c("BaseFactoryRouter"),
    encodeFunctionData({
      abi: artifact("SplitRiskPoolFactory").abi,
      functionName: "initialize",
      args: [account.address, c("Timelock"), router],
    }),
  ]);
  const composite = await run.deploy("ExpandedCompositeOracle", "CompositeOracle");
  await run.write("expansion:oracle-owner", composite, "CompositeOracle", "transferOwnership", [factory]);
  await run.write("expansion:factory-oracle", factory, "SplitRiskPoolFactory", "setCompositeOracle", [composite]);
  await run.write("expansion:fee-recipient", factory, "SplitRiskPoolFactory", "setDefaultProtocolFeeRecipient", [
    c("Timelock"),
  ]);
  const original = deploymentAssets(base, network);
  const assets = [
    ...original.filter((a) => ["wmon", "shmon", "test-usd", "test-usd-vault"].includes(a.id)),
    ...expansion.assets
      .filter((a) => a.id === "agora-ausd")
      .map((a) => ({
        ...a,
        external: true,
        kind: a.id === "agora-ausd" ? "test-unit" : "external-reference",
      })),
  ].map((a) => ({ ...a, feed: price }));
  for (const a of assets) {
    await run.write("expansion:token:" + a.id, factory, "SplitRiskPoolFactory", "addTokenInitial", [
      a.address,
      a.name,
      a.symbol,
      price,
      zeroAddress,
      10000n,
      true,
    ]);
    if (["test-usd", "test-usd-vault", "agora-ausd"].includes(a.id))
      await run.write(
        "expansion:strict:" + a.id,
        factory,
        "SplitRiskPoolFactory",
        "setTokenRequiresStrictProtectedPrice",
        [a.address, true],
      );
  }
  await run.write("expansion:finalize", factory, "SplitRiskPoolFactory", "finalizeBootstrap");
  await run.write("expansion:governance", factory, "SplitRiskPoolFactory", "transferOwnership", [c("Timelock")]);
  // One legitimate official faucet claim; never bypass cooldown or request-limit checks.
  await call("ausd-claim", expansion.faucet.address, faucetAbi, "requestFunds", [account.address]);
  // Canonical WMON remains unregistered: its fallback exhausts unbounded static probes.
  for (const [id, protectedId, backingId, seed] of [
    ["wmon-ausd", "wmon", "agora-ausd", 2000n * 10n ** 6n],
    ["shmon-ausd", "shmon", "agora-ausd", 2000n * 10n ** 6n],
  ]) {
    const shield = assets.find((a) => a.id === protectedId),
      back = assets.find((a) => a.id === backingId);
    const minimum = await run.read(factory, "SplitRiskPoolFactory", "minimumCreationBondUsd");
    const unitPrice = await run.read(price, "MonadAssetRegistry", "getPrice", [back.address]);
    const bond = (minimum * 10n ** BigInt(back.decimals) + unitPrice - 1n) / unitPrice;
    await call(id + ":bond", back.address, erc20, "approve", [factory, bond]);
    const receipt = await run.write("expansion:" + id + ":create", factory, "SplitRiskPoolFactory", "createPool", [
      shield.address,
      shield.symbol,
      back.address,
      back.symbol,
      1000n,
      100n,
      15000n,
      bond,
    ]);
    const logs = parseEventLogs({
      abi: artifact("SplitRiskPoolFactory").abi,
      logs: receipt.logs,
      eventName: "PoolCreated",
      strict: true,
    }).filter((e) => e.address.toLowerCase() === factory.toLowerCase());
    assert.equal(logs.length, 1);
    const pool = logs[0].args.poolAddress;
    if (!manifest.pools.some((p) => p.id === id))
      manifest.pools.push({
        id,
        address: pool,
        shieldedToken: shield.address,
        backingToken: back.address,
        symbol: shield.symbol,
        backingSymbol: back.symbol,
        environment: "reference",
        priceKind: shield.kind,
        createdTx: receipt.transactionHash,
        factoryVersion: "expanded-v2",
      });
    run.save();
    await call(id + ":seed-approval", back.address, erc20, "approve", [pool, seed]);
    await run.write("expansion:" + id + ":seed", pool, "SplitRiskPool", "depositBackingAsset", [
      back.address,
      seed,
      seed,
    ]);
    await run.expect(pool, "SplitRiskPool", "POOL_FACTORY", [], factory);
  }
  const additional = assets.filter((a) => ["agora-ausd", "canonical-wmon"].includes(a.id));
  const version = {
    id: "expanded-v2",
    contract: "ExpandedFactory",
    router: "ExpandedPoolRouter",
    environment: "reference",
    protectedAssets: ["wmon", "shmon"],
    backingAssets: ["test-usd", "test-usd-vault", "agora-ausd"],
  };
  manifest.status = "complete";
  manifest.completedAt = new Date().toISOString();
  manifest.additionalAssets = additional;
  manifest.expandedFactories = [version];
  run.save();
  const merged = {
    ...base,
    contracts: manifest.contracts,
    transactions: { ...base.transactions, ...manifest.transactions },
    pools: [...base.pools.filter((p) => !manifest.pools.some((n) => n.id === p.id)), ...manifest.pools],
    additionalAssets: additional,
    expandedFactories: [version],
  };
  merged.assets = deploymentAssets(merged, network);
  atomicJson(resolve(ROOT, "contracts/deployments/monad-testnet.json"), merged);
  console.log("Expanded deployment complete; verify before syncing application registry.");
} finally {
  release();
}
