/**
 * Local-only Base adapter rehearsal. Starts and owns a loopback Anvil fork, then discards it.
 * Public Base Sepolia supplies read-only fork state. No private key or deployment env is read.
 * Synthetic observations, impersonation, faucet setup and time travel are confined to Anvil.
 *
 * Prerequisites: anvil in PATH, reviewed contracts/out artifacts, built workspace packages.
 * Run: node scripts/base-local-rehearsal.mjs
 * This is a test of transaction integration, not proof of live source freshness or launch readiness.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createPublicClient, createTestClient, createWalletClient, getAddress, http, parseEventLogs } from "viem";
import { base, baseSepolia } from "viem/chains";
import { createEvmAdapter, planIntent, readFaucetStatus } from "@yieldshield/adapter-evm";
import { readSourceSnapshot } from "../services/base-market-data.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUBLIC_FORK_RPC = "https://base-sepolia-rpc.publicnode.com";
const USER = getAddress("0x00000000000000000000000000000000A11CE123");
const DAY = 86400n;

export function assertLoopbackRpc(rpc) {
  const url = new URL(rpc);
  assert(
    url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.port &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash,
    "Rehearsal writes require an explicit 127.0.0.1 HTTP port",
  );
}
const artifactAbi = (name) =>
  JSON.parse(readFileSync(resolve(ROOT, `contracts/out/${name}.sol/${name}.json`), "utf8")).abi;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
async function unusedPort() {
  const listener = createServer();
  await new Promise((done, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", done);
  });
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  return port;
}

export async function main() {
  const manifestPath = resolve(ROOT, "contracts/deployments/base-sepolia-alpha.json");
  const originalManifest = readFileSync(manifestPath, "utf8"),
    manifest = JSON.parse(originalManifest);
  assert.equal(manifest.chainId, 84532);
  assert.equal(manifest.sourceChainId, 8453);
  const contract = (name) => getAddress(manifest.contracts[name].address);
  const factory = contract("Factory"),
    compositeOracle = contract("CompositeOracle"),
    faucet = contract("Faucet"),
    relay = contract("BaseSepoliaStockRegistry"),
    calendar = contract("USMarketSessionGate");
  const deployer = getAddress(manifest.deployer),
    timelock = contract("Timelock");
  const stock = manifest.assets.find((asset) => asset.sourceSymbol === "AAPLc"),
    backing = manifest.assets.find((asset) => asset.sourceSymbol === "USDC");
  const abis = Object.fromEntries(
    [
      "SplitRiskPoolFactory",
      "SplitRiskPool",
      "ConfigurableTokenFaucet",
      "MockERC20Decimals",
      "BaseSepoliaStockRegistry",
      "USMarketSessionGate",
    ].map((name) => [name, artifactAbi(name)]),
  );
  const publicFork = createPublicClient({
    chain: baseSepolia,
    transport: http(PUBLIC_FORK_RPC, { timeout: 15000, retryCount: 1 }),
  });
  assert.equal(await publicFork.getChainId(), 84532);
  const forkBlock = (await publicFork.getBlockNumber({ cacheTime: 0 })) - 2n;
  // Source reads are only a price seed for the explicitly synthetic LOCAL observations below.
  const source = await readSourceSnapshot(
    createPublicClient({ chain: base, transport: http("https://mainnet.base.org", { timeout: 15000, retryCount: 1 }) }),
  );
  const port = await unusedPort(),
    rpc = `http://127.0.0.1:${port}`;
  assertLoopbackRpc(rpc);
  const anvil = spawn(
    "anvil",
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      "84532",
      "--fork-url",
      PUBLIC_FORK_RPC,
      "--fork-block-number",
      String(forkBlock),
      "--accounts",
      "0",
      "--silent",
    ],
    { stdio: "ignore" },
  );
  let startupError;
  anvil.once("error", (error) => {
    startupError = error;
  });
  const adapter = createEvmAdapter({
    chain: baseSepolia,
    rpcUrl: rpc,
    factory,
    compositeOracle,
    faucetAddress: faucet,
    label: "LOCAL Base fork",
  });
  const pub = adapter.publicClient;
  const test = createTestClient({ chain: baseSepolia, mode: "anvil", transport: http(rpc, { retryCount: 0 }) });
  const wallet = createWalletClient({ chain: baseSepolia, transport: http(rpc, { retryCount: 0 }) });
  const originalNow = Date.now;
  let clockSeconds = 0n,
    guarded = false,
    transactions = 0,
    assertions = 0;
  let localStockPrice = 100n * 10n ** 8n;
  function localOnly() {
    assertLoopbackRpc(rpc);
    assert(guarded && anvil.exitCode === null, "Owned Anvil process is not active");
  }
  async function syncClock() {
    localOnly();
    clockSeconds = (await pub.getBlock({ blockTag: "latest" })).timestamp;
    Date.now = () => Number(clockSeconds) * 1000;
  }
  function check(condition, label) {
    assert(condition, label);
    assertions++;
    console.log(`PASS ${label}`);
  }
  async function read(address, type, functionName, args = []) {
    return pub.readContract({ address, abi: abis[type], functionName, args });
  }
  async function send(from, address, abi, functionName, args = []) {
    localOnly();
    await syncClock();
    await pub.simulateContract({ address, abi, functionName, args, account: from });
    const hash = await wallet.writeContract({
      address,
      abi,
      functionName,
      args,
      account: from,
      chain: baseSepolia,
      gas: 15000000n,
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", `Local ${functionName} reverted`);
    transactions++;
    await syncClock();
    return receipt;
  }
  const write = (from, address, type, method, args = []) => send(from, address, abis[type], method, args);
  async function execute(intent, owner = USER) {
    localOnly();
    await syncClock();
    const plan = await planIntent(pub, owner, { factory, faucet }, intent);
    let receipt;
    for (const step of plan.steps) {
      await syncClock();
      await plan.beforeStep?.();
      receipt = await send(owner, step.address, step.abi, step.functionName, step.args);
    }
    return { steps: plan.steps, receipt, ...plan.extract?.(receipt) };
  }
  async function localFreshObservations() {
    localOnly();
    await syncClock();
    const previous = await Promise.all(
      manifest.assets.map((asset) => read(relay, "BaseSepoliaStockRegistry", "lastObservation", [asset.testToken])),
    );
    const sourceBlockNumber =
      previous.reduce(
        (max, row) => (row[0].sourceBlockNumber > max ? row[0].sourceBlockNumber : max),
        source.blockNumber,
      ) + 1n;
    const sourceBlockTimestamp = clockSeconds;
    const sequencerStartedAt = previous.reduce(
      (max, row) => (row[0].sequencerStartedAt > max ? row[0].sequencerStartedAt : max),
      clockSeconds - 7200n,
    );
    const operator = await read(relay, "BaseSepoliaStockRegistry", "operator");
    await test.impersonateAccount({ address: operator });
    await test.setBalance({ address: operator, value: 100n * 10n ** 18n });
    for (const [index, asset] of manifest.assets.entries()) {
      const seed = source.assets.find((item) => same(item.token, asset.sourceToken));
      assert(seed);
      const roundId = previous[index][0].roundId + 1n;
      const observation = {
        roundId,
        answer: asset.sourceSymbol === "AAPLc" ? localStockPrice : seed.round[1],
        startedAt: sourceBlockTimestamp,
        updatedAt: sourceBlockTimestamp,
        answeredInRound: roundId,
        multiplier: seed.multiplier,
        oraclePaused: false,
        sequencerAnswer: 0n,
        sequencerStartedAt,
        sourceBlockNumber,
        sourceBlockTimestamp,
      };
      await write(operator, relay, "BaseSepoliaStockRegistry", "submitObservation", [asset.testToken, observation]);
    }
  }
  async function warp(seconds) {
    localOnly();
    await test.increaseTime({ seconds: Number(seconds) });
    await test.mine({ blocks: 1 });
    await syncClock();
    await localFreshObservations();
  }
  try {
    let version;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (startupError) throw startupError;
      if (anvil.exitCode !== null) throw new Error("Local Anvil exited before startup");
      try {
        version = await test.request({ method: "web3_clientVersion" });
        break;
      } catch {
        await sleep(250);
      }
    }
    assert(typeof version === "string" && /anvil/i.test(version), "Expected an owned Anvil fork");
    assert.equal(await pub.getChainId(), 84532);
    guarded = true;
    for (const account of [deployer, timelock, USER]) {
      localOnly();
      await test.impersonateAccount({ address: account });
      await test.setBalance({ address: account, value: 100n * 10n ** 18n });
    }
    await syncClock();
    // The real calendar is left unchanged publicly. This local day is opened explicitly for rehearsal.
    const calendarOwner = await read(calendar, "USMarketSessionGate", "owner");
    assert(same(calendarOwner, timelock));
    await write(timelock, calendar, "USMarketSessionGate", "setDailySession", [clockSeconds / DAY, 0, Number(DAY)]);
    await localFreshObservations();
    check(await read(calendar, "USMarketSessionGate", "isMarketOpen"), "local test session is open");
    for (const asset of manifest.assets) {
      const owner = await read(asset.testToken, "MockERC20Decimals", "owner");
      assert(same(owner, timelock));
      await write(timelock, asset.testToken, "MockERC20Decimals", "mint", [
        deployer,
        1000000n * 10n ** BigInt(asset.decimals),
      ]);
      await write(deployer, asset.testToken, "MockERC20Decimals", "transfer", [
        faucet,
        500000n * 10n ** BigInt(asset.decimals),
      ]);
    }
    const faucetOwner = await read(faucet, "ConfigurableTokenFaucet", "owner");
    assert([deployer, timelock].some((owner) => same(owner, faucetOwner)));
    await write(faucetOwner, faucet, "ConfigurableTokenFaucet", "setTokens", [
      manifest.assets.map((asset) => asset.testToken),
      manifest.assets.map((asset) => (asset.isEquity ? 25n : 10000n) * 10n ** BigInt(asset.decimals)),
    ]);
    const bond = 1000n * 10n ** 6n;
    await write(deployer, backing.testToken, "MockERC20Decimals", "approve", [factory, bond]);
    const poolReceipt = await write(deployer, factory, "SplitRiskPoolFactory", "createPool", [
      stock.testToken,
      stock.symbol,
      backing.testToken,
      backing.symbol,
      1000n,
      100n,
      15000n,
      bond,
    ]);
    const created = parseEventLogs({
      abi: abis.SplitRiskPoolFactory,
      logs: poolReceipt.logs,
      eventName: "PoolCreated",
    }).filter((event) => same(event.address, factory));
    assert.equal(created.length, 1);
    const pool = created[0].args.poolAddress;
    const seeded = await execute(
      {
        kind: "depositBacking",
        pool,
        backingToken: backing.testToken,
        amount: 50000n * 10n ** 6n,
        minReceived: 50000n * 10n ** 6n,
      },
      deployer,
    );
    check(!!seeded.positionId, "collateral deposit extracts the protector receipt");
    await syncClock();
    const initialFaucet = await readFaucetStatus(pub, faucet, USER);
    check(initialFaucet.ready, "adapter recognizes a funded faucet before first claim");
    await execute({ kind: "faucetDrip", recipient: USER });
    const balance = await read(stock.testToken, "MockERC20Decimals", "balanceOf", [USER]);
    check(balance === 25n * 10n ** 8n, "faucet delivers 25 test shares to the new wallet");
    await syncClock();
    check(!(await readFaucetStatus(pub, faucet, USER)).ready, "faucet reader recognizes the post-claim cooldown");
    await assert.rejects(execute({ kind: "faucetDrip", recipient: USER }), /No test tokens are available/);
    assertions++;
    await syncClock();
    const pools = await adapter.reader.loadPools();
    const view = pools.find((item) => same(item.address, pool));
    check(!!view, "reader discovers the new stock pool through the factory");
    check(view.availability?.openPosition?.state === "available", "reader reports local stock opening eligibility");
    const amount = 5n * 10n ** 8n;
    const depositIntent = {
      kind: "depositShielded",
      pool,
      shieldedToken: stock.testToken,
      backingToken: backing.testToken,
      amount,
      minReceived: amount,
    };
    await write(timelock, calendar, "USMarketSessionGate", "clearDailySession", [clockSeconds / DAY]);
    await syncClock();
    const closedView = (await adapter.reader.loadPools()).find((item) => same(item.address, pool));
    check(
      closedView.availability.openPosition.state === "blocked" &&
        closedView.availability.provideCollateral.state === "available",
      "closed calendar blocks stock openings independently of collateral provision",
    );
    const approvalsBefore = transactions;
    await assert.rejects(execute(depositIntent));
    check(
      transactions === approvalsBefore &&
        (await read(stock.testToken, "MockERC20Decimals", "allowance", [USER, pool])) === 0n,
      "closed session is rejected before any approval transaction",
    );
    await write(timelock, calendar, "USMarketSessionGate", "setDailySession", [clockSeconds / DAY, 0, Number(DAY)]);
    const deposit = await execute(depositIntent);
    check(
      deposit.steps.some((step) => step.functionName === "approve" && step.args[1] === amount),
      "stock deposit uses an exact allowance",
    );
    check(!!deposit.positionId, "stock deposit extracts its shield receipt");
    await syncClock();
    let positions = await adapter.reader.getOwnerPositions(USER);
    const position = positions.shield.find((item) => item.id === deposit.positionId);
    check(position?.deposited === amount, "reader returns the deposited stock position");
    localOnly();
    await test.increaseTime({ seconds: 601 });
    await test.mine({ blocks: 1 });
    await syncClock();
    const stalePositions = await adapter.reader.getOwnerPositions(USER),
      retained = stalePositions.shield.find((item) => item.id === deposit.positionId);
    check(
      retained?.deposited === amount && retained.sameAssetQuoteAvailable === false,
      "expired relay preserves the owned position while disabling its withdrawal quote",
    );
    await localFreshObservations();
    const beforeExit = await read(stock.testToken, "MockERC20Decimals", "balanceOf", [USER]);
    await execute({
      kind: "withdrawShielded",
      pool,
      shieldedToken: stock.testToken,
      position: deposit.positionId,
      minOut: (amount * 99n) / 100n,
    });
    await syncClock();
    positions = await adapter.reader.getOwnerPositions(USER);
    check(
      !positions.shield.some((item) => item.id === deposit.positionId),
      "same-stock exit removes the consumed receipt",
    );
    check(
      (await read(stock.testToken, "MockERC20Decimals", "balanceOf", [USER])) > beforeExit,
      "same-stock exit returns test shares",
    );
    const protectedDeposit = await execute(depositIntent);
    await syncClock();
    positions = await adapter.reader.getOwnerPositions(USER);
    const protectedPosition = positions.shield.find((item) => item.id === protectedDeposit.positionId);
    check(
      protectedPosition && !protectedPosition.protectedExitUnlocked,
      "reader keeps protected exit locked before its delay",
    );
    check(
      protectedPosition.valueAtDepositUsd === 500n * 10n ** 8n,
      "five shares record their original $100 entry value",
    );
    const expectedBacking =
      (protectedPosition.valueAtDepositUsd * 10n ** 6n) /
      source.assets.find((item) => same(item.token, backing.sourceToken)).round[1];
    const cappedBacking =
      expectedBacking < protectedPosition.collateralAmount ? expectedBacking : protectedPosition.collateralAmount;
    const minBacking = cappedBacking;
    const protectedIntent = {
      kind: "activateShielded",
      pool,
      shieldedToken: stock.testToken,
      backingToken: backing.testToken,
      position: protectedDeposit.positionId,
      minOut: minBacking,
    };
    await assert.rejects(execute(protectedIntent), (error) => {
      let current = error;
      while (current) {
        if (current.data?.errorName === "InsufficientPoolTimeWithDetails") return true;
        current = current.cause;
      }
      return false;
    });
    assertions++;
    localStockPrice = 75n * 10n ** 8n;
    await warp(view.stats.minimumPoolTime + 60n);
    await write(timelock, calendar, "USMarketSessionGate", "clearDailySession", [clockSeconds / DAY]);
    await syncClock();
    positions = await adapter.reader.getOwnerPositions(USER);
    check(
      positions.shield.find((item) => item.id === protectedDeposit.positionId)?.protectedExitUnlocked,
      "reader recognizes the local elapsed protected-exit delay",
    );
    const droppedPosition = positions.shield.find((item) => item.id === protectedDeposit.positionId);
    check(
      droppedPosition.currentValueUsd === 375n * 10n ** 8n,
      "reader values the five shares after a 25% local price drop",
    );
    check(
      droppedPosition.protectedExit?.state === "available" &&
        droppedPosition.protectedExitQuote?.amount === cappedBacking,
      "closed-session protected quote retains entry value within its native collateral cap",
    );
    const backingBefore = await read(backing.testToken, "MockERC20Decimals", "balanceOf", [USER]);
    await execute(protectedIntent);
    await syncClock();
    positions = await adapter.reader.getOwnerPositions(USER);
    check(
      !positions.shield.some((item) => item.id === protectedDeposit.positionId),
      "protected exit consumes the shield receipt",
    );
    check(
      (await read(backing.testToken, "MockERC20Decimals", "balanceOf", [USER])) - backingBefore === cappedBacking,
      "after a 25% stock price drop, protected exit pays the exact capped entry-equivalent TestUSDC",
    );
    check(readFileSync(manifestPath, "utf8") === originalManifest, "public deployment manifest remains unchanged");
    console.log(
      JSON.stringify(
        {
          mode: "local-only-anvil-fork",
          chainId: 84532,
          publicForkBlock: String(forkBlock),
          assertions,
          localTransactions: transactions,
          pool,
          sourcePrices:
            "Public read-only seed; AAPL fixture $100 then $75; all refreshed observations and time advances synthetic on local Anvil",
          priceDropScenario: {
            shares: "5",
            entryPriceUsd: "100",
            exitPriceUsd: "75",
            entryValueUsd: "500",
            payoutBaseUnits: String(cappedBacking),
            collateralCapBaseUnits: String(protectedPosition.collateralAmount),
          },
          publicWrites: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    Date.now = originalNow;
    guarded = false;
    anvil.kill("SIGTERM");
    await new Promise((done) => {
      if (anvil.exitCode !== null) done();
      else {
        const timer = setTimeout(() => {
          anvil.kill("SIGKILL");
          done();
        }, 3000);
        anvil.once("exit", () => {
          clearTimeout(timer);
          done();
        });
      }
    });
    assert.equal(readFileSync(manifestPath, "utf8"), originalManifest, "Rehearsal changed public deployment manifest");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.shortMessage ?? error.message);
    process.exitCode = 1;
  });
