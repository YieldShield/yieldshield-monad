#!/usr/bin/env node
/** One-time, resumable transactions using valueless Base Sepolia demo assets only.
 * Default validates the plan without reading a key or signing. Root must explicitly run --broadcast.
 * Execution-gas cap: 0.001 test ETH, excluding Base L1 data fees (runner reserves 0.0001 ETH).
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeFunctionData,
  parseAbi,
  parseEventLogs,
  parseEther,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  ROOT,
  SequentialDeployment,
  acquireDeploymentLock,
  atomicJson,
  readCanonicalReceipt,
} from "./deploy-base-sepolia.mjs";
import { DEMO_KIND, DEPLOYER, demoEnvironment } from "./deploy-base-demo.mjs";
import { validateDemoManifest, readDemoStatus } from "../services/base-demo-status.mjs";

const JOURNAL_KIND = "base-sepolia-demo-smoke-v1";
const journalPath = resolve(ROOT, "contracts/deployments/base-sepolia-demo-smoke-v1.json");
const manifestPath = resolve(ROOT, "contracts/deployments/base-sepolia-demo-v1.json");
const ownPath = fileURLToPath(import.meta.url);
const stringify = (value) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const restoreIntent = (intent) =>
  Object.fromEntries(
    Object.entries(intent).map(([key, value]) => [
      key,
      ["amount", "limit", "deadline", "minOut", "minReceived"].includes(key) ? BigInt(value) : value,
    ]),
  );
const transferAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const nftAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)"]);
const poolAbi = parseAbi([
  "event ShieldedAssetDeposited(address indexed depositor,address indexed asset,uint256 amount,uint256 receiptTokenId)",
  "event ProtectorAssetDeposited(address indexed depositor,address indexed asset,uint256 amount,uint256 receiptTokenId)",
  "function shieldReceiptNFT() view returns (address)",
  "function protectorReceiptNFT() view returns (address)",
  "function poolConfig() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,address,uint96,address)",
  "function getShieldDepositInfo(uint256) view returns (uint256,uint64,uint256,uint64)",
  "function getProtectorDepositInfo(uint256) view returns (uint256,uint64,uint64,uint256,uint256,uint256)",
]);
const tokenAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const exchangeAbi = parseAbi([
  "event Swapped(address indexed trader,address indexed stock,bool buy,uint256 stockAmount,uint256 usdcAmount,uint256 feeAmount)",
]);
const AMOUNT = 100000000n;

/** Receipt-scoped token movements avoid attributing unrelated balance changes to this smoke run. */
export function receiptTokenFlows(receipt, owner, tokens) {
  const result = Object.fromEntries(tokens.map((token) => [token.toLowerCase(), { received: 0n, sent: 0n }]));
  const logs = receipt.logs.filter((log) => Object.hasOwn(result, log.address.toLowerCase()));
  for (const log of parseEventLogs({ abi: transferAbi, logs, eventName: "Transfer", strict: true })) {
    const flow = result[log.address.toLowerCase()];
    if (same(log.args.to, owner)) flow.received += log.args.value;
    if (same(log.args.from, owner)) flow.sent += log.args.value;
  }
  return result;
}
export function verifySmokeJournal(journal, manifestDigest, recipeHash) {
  assert.equal(journal.kind, JOURNAL_KIND);
  assert.equal(journal.chainId, 84532);
  assert(same(journal.deployer, DEPLOYER));
  assert.equal(journal.manifestDigest, manifestDigest, "Smoke deployment changed");
  assert.equal(
    journal.recipeHash,
    recipeHash,
    "Smoke recipe/adapter changed; review the existing journal before resuming",
  );
  assert(journal.transactions && journal.operations && journal.evidence, "Invalid smoke journal");
  assert(Object.keys(journal.transactions).length <= 60, "Smoke transaction bound exceeded");
}
const smokeCalls = parseAbi([
  "function approve(address,uint256)",
  "function swap(address,bool,uint256,uint256,uint256)",
  "function depositShieldedAsset(address,uint256,uint256)",
  "function depositBackingAsset(address,uint256,uint256)",
  "function shieldedWithdraw(uint256,address,uint256)",
  "function protectorWithdraw(uint256,uint256,address,uint256)",
  "function startUnlockProcess(uint256)",
  "function dripAll(address)",
]);
/** Independently binds editable journal data to this small reviewed operation set before any signing. */
export function assertSmokeOperation(id, operation, context) {
  const { pool, stocks, usd, exchange, faucet, owner, positions } = context;
  const first = stocks[0],
    intent = restoreIntent(operation.intent);
  let expected,
    approval,
    finalTarget = pool,
    functionName,
    args;
  const stock = stocks.find((asset) => id === `${asset.symbol}:buy` || id === `${asset.symbol}:sell`);
  if (stock) {
    const side = id.endsWith(":buy") ? "buy" : "sell";
    expected = { kind: "demoTrade", asset: stock.testToken, side, amount: AMOUNT };
    assert(intent.limit >= 70000000n && intent.limit <= 300000000n, "Trade dollar limit outside smoke bounds");
    assert(intent.deadline > 0n, "Invalid smoke quote deadline");
    approval = {
      token: side === "buy" ? usd.testToken : stock.testToken,
      spender: exchange,
      amount: side === "buy" ? intent.limit : AMOUNT,
    };
    finalTarget = exchange;
    functionName = "swap";
    args = [stock.testToken, side === "buy", AMOUNT, intent.limit, intent.deadline];
  } else if (["collateral-deposit", "stock-deposit", "protected-deposit"].includes(id)) {
    const shield = id !== "collateral-deposit",
      asset = shield ? first.testToken : usd.testToken;
    expected = {
      kind: shield ? "depositShielded" : "depositBacking",
      pool,
      backingToken: usd.testToken,
      amount: AMOUNT,
      minReceived: AMOUNT,
      ...(shield ? { shieldedToken: asset } : {}),
    };
    approval = { token: asset, spender: pool, amount: AMOUNT };
    functionName = shield ? "depositShieldedAsset" : "depositBackingAsset";
    args = [asset, AMOUNT, AMOUNT];
  } else if (id === "faucet-claim") {
    expected = { kind: "faucetDrip", recipient: owner };
    finalTarget = faucet;
    functionName = "dripAll";
    args = [owner];
  } else if (id === "collateral-unlock") {
    assert(positions["collateral-deposit"], "Missing verified fresh collateral receipt");
    expected = { kind: "startUnlock", position: positions["collateral-deposit"].position };
    functionName = "startUnlockProcess";
    args = [BigInt(positions["collateral-deposit"].tokenId)];
  } else if (["stock-exit", "protected-exit", "collateral-exit"].includes(id)) {
    const key =
      id === "stock-exit" ? "stock-deposit" : id === "protected-exit" ? "protected-deposit" : "collateral-deposit";
    assert(positions[key], "Exit must use a receipt minted by this smoke run");
    const tokenId = BigInt(positions[key].tokenId);
    if (id === "stock-exit") {
      expected = {
        kind: "withdrawShielded",
        pool,
        position: positions[key].position,
        shieldedToken: first.testToken,
        minOut: 90000000n,
      };
      functionName = "shieldedWithdraw";
      args = [tokenId, first.testToken, expected.minOut];
    } else if (id === "protected-exit") {
      expected = {
        kind: "activateShielded",
        pool,
        position: positions[key].position,
        shieldedToken: first.testToken,
        backingToken: usd.testToken,
      };
      assert(intent.minOut > 0n && intent.minOut <= 300000000n, "Protected payout outside smoke bounds");
      functionName = "shieldedWithdraw";
      args = [tokenId, usd.testToken, intent.minOut];
    } else {
      expected = {
        kind: "withdrawProtector",
        pool,
        position: positions[key].position,
        backingToken: usd.testToken,
        minOut: 90000000n,
      };
      const decoded = decodeFunctionData({ abi: smokeCalls, data: operation.steps.at(-1).data });
      assert.equal(decoded.functionName, "protectorWithdraw");
      assert(
        decoded.args[1] > 0n && decoded.args[1] <= 110000000n,
        "New collateral receipt withdrawal outside smoke bounds",
      );
      functionName = "protectorWithdraw";
      args = [tokenId, decoded.args[1], usd.testToken, expected.minOut];
    }
  } else throw new Error("Unknown smoke operation");
  for (const [key, value] of Object.entries(expected))
    assert(typeof value === "string" ? same(intent[key], value) : intent[key] === value, `Smoke ${id} ${key} changed`);
  const allowed = new Set([
    ...Object.keys(expected),
    ...(stock ? ["limit", "deadline"] : id === "protected-exit" ? ["minOut"] : []),
  ]);
  assert(
    Object.keys(intent).every((key) => allowed.has(key)),
    "Unexpected smoke intent fields",
  );
  assert(
    Number.isInteger(operation.attempt) && operation.attempt >= 0 && operation.attempt <= (stock ? 1 : 0),
    "Unbounded smoke attempts",
  );
  assert(
    Array.isArray(operation.steps) && operation.steps.length >= 1 && operation.steps.length <= (approval ? 3 : 1),
    "Unexpected smoke step count",
  );
  operation.steps.forEach((step, i) =>
    assert.equal(step.id, `${id}:attempt${operation.attempt}:step${i}`, "Smoke step identity changed"),
  );
  const final = operation.steps.at(-1);
  assert(
    same(final.to, finalTarget) && same(final.data, encodeFunctionData({ abi: smokeCalls, functionName, args })),
    "Smoke final calldata changed",
  );
  operation.steps.slice(0, -1).forEach((step, index, approvals) => {
    const amount = approvals.length === 2 && index === 0 ? 0n : approval.amount;
    assert(
      same(step.to, approval.token) &&
        same(
          step.data,
          encodeFunctionData({ abi: smokeCalls, functionName: "approve", args: [approval.spender, amount] }),
        ),
      "Smoke approval target or bounded amount changed",
    );
  });
}
function decodeMint(receipt, pool, owner, asset, side, nft) {
  const eventName = side === "shield" ? "ShieldedAssetDeposited" : "ProtectorAssetDeposited";
  const deposits = parseEventLogs({ abi: poolAbi, logs: receipt.logs, eventName, strict: true }).filter(
    (log) => same(log.address, pool) && same(log.args.depositor, owner) && same(log.args.asset, asset),
  );
  assert.equal(deposits.length, 1, "Missing exact smoke deposit event");
  const tokenId = deposits[0].args.receiptTokenId;
  const mints = parseEventLogs({
    abi: nftAbi,
    logs: receipt.logs.filter((log) => same(log.address, nft)),
    eventName: "Transfer",
    strict: true,
  });
  assert(
    mints.some((log) => same(log.args.from, zeroAddress) && same(log.args.to, owner) && log.args.tokenId === tokenId),
    "Smoke receipt NFT was not minted to deployer",
  );
  return { tokenId, amount: deposits[0].args.amount, position: `${pool}-${side === "shield" ? "s" : "p"}-${tokenId}` };
}
function assertBurn(receipt, owner, nft, tokenId) {
  const events = parseEventLogs({
    abi: nftAbi,
    logs: receipt.logs.filter((log) => same(log.address, nft)),
    eventName: "Transfer",
    strict: true,
  });
  assert(
    events.some(
      (log) => same(log.args.from, owner) && same(log.args.to, zeroAddress) && log.args.tokenId === BigInt(tokenId),
    ),
    "Smoke exit did not close its receipt NFT",
  );
}

export async function main() {
  const args = new Set(process.argv.slice(2));
  assert(
    [...args].every((arg) => ["--prepare", "--broadcast"].includes(arg)),
    "Unknown argument",
  );
  assert(!(args.has("--prepare") && args.has("--broadcast")), "Choose prepare or broadcast");
  const broadcast = args.has("--broadcast");
  const rawManifest = readFileSync(manifestPath, "utf8"),
    manifest = JSON.parse(rawManifest);
  validateDemoManifest(manifest);
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.deploymentKind, DEMO_KIND);
  const { c, assets } = validateDemoManifest(manifest),
    stocks = assets.filter((asset) => asset.isEquity),
    usd = assets[4];
  const release = broadcast
    ? acquireDeploymentLock(resolve(ROOT, "contracts/.base-sepolia-deployment.lock"))
    : () => {};
  if (broadcast) {
    process.once("exit", release);
    process.once("SIGINT", () => {
      release();
      process.exit(130);
    });
  }
  try {
    const env = broadcast ? demoEnvironment() : {},
      account = broadcast ? privateKeyToAccount(env.BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY) : { address: DEPLOYER };
    assert(same(account.address, DEPLOYER), "Wrong dedicated Sepolia deployer");
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com", {
        timeout: 15000,
        retryCount: 1,
        batch: { batchSize: 20, wait: 20 },
      }),
    });
    assert.equal(await client.getChainId(), 84532, "No smoke transactions outside Base Sepolia");
    const [
      { DEMO_DEPLOYMENTS },
      { DEPLOYMENTS },
      { planIntent },
      { readDemoTradeQuote },
      { createReader },
      { readFaucetStatus },
    ] = await Promise.all([
      import("../packages/adapter-evm/dist/demo-deployments.js"),
      import("../packages/adapter-evm/dist/deployments.js"),
      import("../packages/adapter-evm/dist/intents.js"),
      import("../packages/adapter-evm/dist/demo-trading.js"),
      import("../packages/adapter-evm/dist/reader.js"),
      import("../packages/adapter-evm/dist/faucet.js"),
    ]);
    const demo = DEMO_DEPLOYMENTS[84532],
      published = DEPLOYMENTS[84532];
    assert(demo && published, "Publish and build the reviewed demo adapter before running smoke transactions");
    assert(
      same(demo.exchange, c("DemoExchange")) &&
        same(demo.oracle, c("DemoOracle")) &&
        same(demo.quoteToken, usd.testToken) &&
        same(published.factory, c("Factory")) &&
        same(published.compositeOracle, c("CompositeOracle")) &&
        same(published.faucet, c("Faucet")),
      "Compiled adapter points to a different deployment",
    );
    assert(
      same(demo.exchangeCodehash, manifest.contracts.DemoExchange.runtimeCodehash) &&
        same(demo.oracleCodehash, manifest.contracts.DemoOracle.runtimeCodehash),
      "Compiled runtime identities differ",
    );
    assert.equal(demo.assets.length, 4);
    for (const asset of stocks)
      assert(
        demo.assets.some((item) => same(item.token, asset.testToken) && item.symbol === asset.symbol),
        "Compiled stock identity differs",
      );
    const status = await readDemoStatus({ client, manifest });
    assert(
      status.deployment.verified && status.exchange.verified && status.deployment.poolsReady === 4,
      "Demo status is not ready for smoke testing",
    );
    const first = stocks[0],
      pool = manifest.pools.find((item) => item.symbol === first.symbol).address;
    const terms = await client.readContract({ address: pool, abi: poolAbi, functionName: "poolConfig" });
    assert.equal(terms[5], 60n, "Reviewed demo protected-exit delay changed");
    assert.equal(terms[6], 120n, "Reviewed demo collateral-unlock delay changed");
    if (!broadcast) {
      console.log(
        stringify({
          mode: "prepare-only",
          chainId: 84532,
          deployment: c("Factory"),
          deployer: DEPLOYER,
          journal: journalPath,
          maximumExecutionGasEth: "0.001",
          includesL1Fees: false,
          operations: [
            "Claim the deployer's test-token basket if currently eligible",
            "Buy and sell one token of each of four demo stocks",
            "Deposit and return one stock position",
            "Deposit one stock position and exercise its TestUSDC exit after the actual 60-second delay",
            "Deposit 100 TestUSDC into a new collateral receipt, request unlock, and withdraw after 120 seconds",
          ],
          note: "No key read, signatures, transactions or journal writes. Published compiled adapter identity, live demo status and actual 60/120-second contract terms verified.",
        }),
      );
      return;
    }
    const adapterFiles = [
      "intents.js",
      "demo-trading.js",
      "demo-deployments.js",
      "deployments.js",
      "reader.js",
      "preflight.js",
      "snapshot.js",
      "faucet.js",
    ];
    const recipeHash = sha(
      stringify({
        script: sha(readFileSync(ownPath)),
        adapter: Object.fromEntries(
          adapterFiles.map((file) => [file, sha(readFileSync(resolve(ROOT, "packages/adapter-evm/dist", file)))]),
        ),
        amount: String(AMOUNT),
        collateral: "100000000",
        quoteAttempts: 2,
      }),
    );
    const manifestDigest = sha(rawManifest);
    const journal = existsSync(journalPath)
      ? JSON.parse(readFileSync(journalPath, "utf8"))
      : {
          schemaVersion: 1,
          kind: JOURNAL_KIND,
          chainId: 84532,
          deployer: DEPLOYER,
          manifestDigest,
          recipeHash,
          status: "running",
          transactions: {},
          operations: {},
          evidence: {},
          createdAt: new Date().toISOString(),
          feePolicy: { maximumExecutionGasWei: parseEther("0.001").toString(), includesL1Fees: false },
        };
    verifySmokeJournal(journal, manifestDigest, recipeHash);
    const run = new SequentialDeployment({
      client,
      account,
      broadcast: true,
      manifestPath: journalPath,
      manifest: journal,
      nonce: await client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      maxFeePerGas: 100000000n,
      spendLimit: parseEther("0.001"),
    });
    const save = () => atomicJson(journalPath, journal);
    const reader = createReader(client, {
      factory: published.factory,
      compositeOracle: published.compositeOracle,
      deploymentBlock: published.deploymentBlock,
    });
    const deps = { factory: published.factory, faucet: published.faucet };
    if (journal.status === "complete") {
      const required = [
        "collateral-deposit",
        "collateral-unlock",
        "collateral-exit",
        "stock-deposit",
        "protected-deposit",
        "stock-exit",
        "protected-exit",
        ...stocks.flatMap((asset) => [`${asset.symbol}:buy`, `${asset.symbol}:sell`]),
      ];
      assert(
        required.every((id) => journal.operations[id]?.steps?.length && journal.evidence[id]?.txHash),
        "Completed smoke is missing required operations",
      );
      assert(
        journal.evidence.positionsRead && journal.evidence.finalBalances?.length === 5,
        "Completed smoke lacks position/balance evidence",
      );
      for (const [id, tx] of Object.entries(journal.transactions)) {
        assert.equal(tx.status, "confirmed");
        const receipt = await readCanonicalReceipt(client, tx.hash, id);
        assert(same(receipt.blockHash, tx.receipt.blockHash));
      }
      console.log("Smoke already completed; canonical receipts rechecked. No transactions submitted.");
      return;
    }
    save();
    async function newTradeIntent(asset, side) {
      const quote = await readDemoTradeQuote(client, {
        asset: asset.testToken,
        side,
        amount: AMOUNT,
        owner: account.address,
      });
      const limit =
        side === "buy" ? (quote.inputAmount * 10050n + 9999n) / 10000n : (quote.outputAmount * 9950n) / 10000n;
      assert(limit > 0n && limit <= 300000000n, "Smoke trade exceeds its 300 TestUSDC per-trade bound");
      return {
        kind: "demoTrade",
        asset: asset.testToken,
        side,
        amount: AMOUNT,
        limit,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 240),
      };
    }
    const knownPositions = {};
    const operationContext = {
      pool,
      stocks,
      usd,
      exchange: demo.exchange,
      faucet: published.faucet,
      owner: account.address,
      positions: knownPositions,
    };
    async function execute(id, intentFactory) {
      let operation = journal.operations[id];
      async function prepare(attempt) {
        const intent = await intentFactory(),
          plan = await planIntent(client, account.address, deps, intent);
        assert(plan.steps.length > 0 && plan.steps.length <= 4, "Unexpected smoke adapter step count");
        operation = {
          intent: JSON.parse(stringify(intent)),
          attempt,
          steps: plan.steps.map((step, i) => ({
            id: `${id}:attempt${attempt}:step${i}`,
            label: step.label,
            to: step.address,
            data: encodeFunctionData({ abi: step.abi, functionName: step.functionName, args: step.args }),
          })),
        };
        assertSmokeOperation(id, operation, operationContext);
        journal.operations[id] = operation;
        save();
      }
      if (!operation) await prepare(0);
      while (true) {
        assertSmokeOperation(id, operation, operationContext);
        try {
          let finalReceipt;
          for (const step of operation.steps) {
            const entry = journal.transactions[step.id];
            let knownReceipt;
            if (entry?.hash)
              try {
                knownReceipt = await client.getTransactionReceipt({ hash: entry.hash });
              } catch (error) {
                if (error.name !== "TransactionReceiptNotFoundError") throw error;
              }
            if (!knownReceipt) {
              const refreshed = await planIntent(client, account.address, deps, restoreIntent(operation.intent));
              const currentFinal = refreshed.steps.at(-1);
              if (step === operation.steps.at(-1))
                assert(
                  same(step.to, currentFinal.address) &&
                    same(
                      step.data,
                      encodeFunctionData({
                        abi: currentFinal.abi,
                        functionName: currentFinal.functionName,
                        args: currentFinal.args,
                      }),
                    ),
                  "Unsigned smoke call differs from fresh adapter plan",
                );
              await refreshed.beforeStep?.();
              assert(Object.keys(journal.transactions).length < 60 || entry, "Smoke transaction count exceeded");
            }
            finalReceipt = await run.transaction(step.id, { to: step.to, data: step.data });
          }
          const flows = receiptTokenFlows(
            finalReceipt,
            account.address,
            assets.map((asset) => asset.testToken),
          );
          journal.evidence[id] = {
            txHash: finalReceipt.transactionHash,
            blockNumber: String(finalReceipt.blockNumber),
            blockHash: finalReceipt.blockHash,
            flows: JSON.parse(stringify(flows)),
          };
          save();
          return { receipt: finalReceipt, flows, intent: restoreIntent(operation.intent) };
        } catch (error) {
          const finalStep = operation.steps.at(-1);
          const approvalsConfirmed = operation.steps
            .slice(0, -1)
            .every((step) => journal.transactions[step.id]?.status === "confirmed");
          // A fresh quote is permitted only before ANY swap hash exists; no replacement transactions.
          if (
            operation.intent.kind === "demoTrade" &&
            operation.attempt < 1 &&
            approvalsConfirmed &&
            !journal.transactions[finalStep.id]
          ) {
            await prepare(operation.attempt + 1);
            continue;
          }
          throw error;
        }
      }
    }
    const [shieldNft, protectorNft] = await Promise.all(
      ["shieldReceiptNFT", "protectorReceiptNFT"].map((functionName) =>
        client.readContract({ address: pool, abi: poolAbi, functionName }),
      ),
    );
    async function deposit(id, side, amount) {
      const asset = side === "shield" ? first.testToken : usd.testToken;
      const result = await execute(id, () => ({
        kind: side === "shield" ? "depositShielded" : "depositBacking",
        pool,
        backingToken: usd.testToken,
        [side === "shield" ? "shieldedToken" : "backingToken"]: asset,
        amount,
        minReceived: amount,
      }));
      const mint = decodeMint(
        result.receipt,
        pool,
        account.address,
        asset,
        side,
        side === "shield" ? shieldNft : protectorNft,
      );
      assert.equal(mint.amount, amount);
      assert.equal(result.flows[asset.toLowerCase()].sent, amount);
      knownPositions[id] = mint;
      journal.evidence[id].position = JSON.parse(stringify(mint));
      save();
      return mint;
    }
    if (!journal.evidence["faucet-skip"] || journal.operations["faucet-claim"]) {
      const availability = journal.operations["faucet-claim"]
        ? null
        : await readFaucetStatus(
            client,
            published.faucet,
            account.address,
            assets.map((asset) => asset.testToken),
          );
      if (journal.operations["faucet-claim"] || availability.ready) {
        const claim = await execute("faucet-claim", () => ({ kind: "faucetDrip", recipient: account.address }));
        const received = assets.map((asset) => ({
          symbol: asset.symbol,
          amount: claim.flows[asset.testToken.toLowerCase()].received,
        }));
        assert(
          received.some((item) => item.amount > 0n),
          "Confirmed faucet claim delivered no test tokens",
        );
        for (let i = 0; i < assets.length; i++)
          assert(
            [0n, (assets[i].isEquity ? 25n : 10000n) * 10n ** BigInt(assets[i].decimals)].includes(received[i].amount),
            "Unexpected faucet delivery amount",
          );
        journal.evidence["faucet-claim"].received = JSON.parse(stringify(received));
        save();
      } else {
        journal.evidence["faucet-skip"] = {
          reason: "Dedicated deployer was not currently eligible; no faucet success claimed",
          checkedAt: new Date().toISOString(),
        };
        save();
      }
    }
    const collateral = await deposit("collateral-deposit", "protector", 100000000n);
    await execute("collateral-unlock", () => ({ kind: "startUnlock", position: collateral.position }));
    for (const asset of stocks)
      for (const side of ["buy", "sell"]) {
        const result = await execute(`${asset.symbol}:${side}`, () => newTradeIntent(asset, side));
        const trades = parseEventLogs({
          abi: exchangeAbi,
          logs: result.receipt.logs,
          eventName: "Swapped",
          strict: true,
        }).filter(
          (log) =>
            same(log.address, demo.exchange) &&
            same(log.args.trader, account.address) &&
            same(log.args.stock, asset.testToken) &&
            log.args.buy === (side === "buy"),
        );
        assert.equal(trades.length, 1, "Missing exact smoke trade event");
        const trade = trades[0].args,
          stockFlow = result.flows[asset.testToken.toLowerCase()],
          usdFlow = result.flows[usd.testToken.toLowerCase()];
        assert.equal(trade.stockAmount, AMOUNT);
        assert(trade.usdcAmount > 0n);
        assert.equal(side === "buy" ? stockFlow.received : stockFlow.sent, AMOUNT);
        assert.equal(side === "buy" ? usdFlow.sent : usdFlow.received, trade.usdcAmount);
        assert(side === "buy" ? trade.usdcAmount <= result.intent.limit : trade.usdcAmount >= result.intent.limit);
        journal.evidence[`${asset.symbol}:${side}`].trade = JSON.parse(stringify(trade));
        save();
      }
    const normal = await deposit("stock-deposit", "shield", AMOUNT);
    const protectedPosition = await deposit("protected-deposit", "shield", AMOUNT);
    if (!journal.evidence.positionsRead && !journal.operations["stock-exit"]) {
      const positions = await reader.getOwnerPositions(account.address);
      for (const position of [normal.position, protectedPosition.position])
        assert(
          positions.shield.some((row) => same(row.id, position)),
          "Adapter reader omitted the new smoke stock position",
        );
      assert(
        positions.protector.some((row) => same(row.id, collateral.position)),
        "Adapter reader omitted the new collateral receipt",
      );
      journal.evidence.positionsRead = {
        positions: [normal.position, protectedPosition.position, collateral.position],
        evaluatedAt: new Date().toISOString(),
      };
      save();
    }
    const deposited = await client.readContract({
      address: pool,
      abi: poolAbi,
      functionName: "getShieldDepositInfo",
      args: [protectedPosition.tokenId],
      blockNumber: BigInt(journal.evidence["protected-deposit"].blockNumber),
    });
    journal.evidence["protected-deposit"].entry = JSON.parse(
      stringify({ amount: deposited[0], depositTime: deposited[1], valueAtDepositUsd8: deposited[2] }),
    );
    save();
    async function waitUntil(timestamp, label) {
      const start = Date.now();
      while (true) {
        const tip = await client.getBlockNumber({ cacheTime: 0 });
        const block = await client.getBlock({ blockNumber: tip - 2n });
        if (block.timestamp >= timestamp) return;
        assert(Date.now() - start < 300000, "Smoke wait exceeded five minutes; journal is resumable");
        const delay = Math.min(60000, Math.max(1000, Number(timestamp - block.timestamp) * 1000));
        console.log(`${label}: waiting ${Math.ceil(delay / 1000)} seconds for the actual Sepolia timestamp.`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    await waitUntil(BigInt(deposited[1]) + terms[5] + 4n, "Protected exit");
    const normalExit = await execute("stock-exit", () => ({
      kind: "withdrawShielded",
      pool,
      position: normal.position,
      shieldedToken: first.testToken,
      minOut: (AMOUNT * 9n) / 10n,
    }));
    assertBurn(normalExit.receipt, account.address, shieldNft, normal.tokenId);
    assert(
      normalExit.flows[first.testToken.toLowerCase()].received >= (AMOUNT * 9n) / 10n &&
        normalExit.flows[first.testToken.toLowerCase()].received <= AMOUNT,
    );
    const protectedExit = await execute("protected-exit", async () => {
      const quote = await reader.getProtectedExitQuote(protectedPosition.position);
      return {
        kind: "activateShielded",
        pool,
        shieldedToken: first.testToken,
        position: protectedPosition.position,
        backingToken: usd.testToken,
        minOut: quote.amount,
      };
    });
    assertBurn(protectedExit.receipt, account.address, shieldNft, protectedPosition.tokenId);
    assert.equal(
      protectedExit.flows[usd.testToken.toLowerCase()].received,
      protectedExit.intent.minOut,
      "Protected payout differs from the accepted exact test-dollar quote",
    );
    const unlockReceipt = await readCanonicalReceipt(
      client,
      journal.evidence["collateral-unlock"].txHash,
      "collateral unlock",
    );
    const protector = await client.readContract({
      address: pool,
      abi: poolAbi,
      functionName: "getProtectorDepositInfo",
      args: [collateral.tokenId],
      blockNumber: unlockReceipt.blockNumber,
    });
    const unlockBlock = await client.getBlock({ blockNumber: unlockReceipt.blockNumber });
    assert.equal(unlockBlock.hash, unlockReceipt.blockHash, "Unlock receipt block changed");
    assert.equal(
      BigInt(protector[2]),
      unlockBlock.timestamp + terms[6],
      "Stored unlock deadline differs from actual demo terms",
    );
    await waitUntil(BigInt(protector[2]) + 4n, "Collateral unlock");
    const collateralExit = await execute("collateral-exit", () => ({
      kind: "withdrawProtector",
      pool,
      position: collateral.position,
      backingToken: usd.testToken,
      minOut: 90000000n,
    }));
    assertBurn(collateralExit.receipt, account.address, protectorNft, collateral.tokenId);
    assert(collateralExit.flows[usd.testToken.toLowerCase()].received >= 90000000n);
    const finalPositions = await reader.getOwnerPositions(account.address);
    assert(
      ![...finalPositions.shield, ...finalPositions.protector].some((row) =>
        [normal.position, protectedPosition.position, collateral.position].some((id) => same(id, row.id)),
      ),
      "Smoke receipts remain open",
    );
    const balances = await Promise.all(
      assets.map(async (asset) => ({
        symbol: asset.symbol,
        amountBaseUnits: String(
          await client.readContract({
            address: asset.testToken,
            abi: tokenAbi,
            functionName: "balanceOf",
            args: [account.address],
          }),
        ),
      })),
    );
    assert.equal(
      sha(readFileSync(manifestPath, "utf8")),
      manifestDigest,
      "Deployment manifest changed during smoke test",
    );
    journal.evidence.finalBalances = balances;
    journal.status = "complete";
    journal.completedAt = new Date().toISOString();
    save();
    console.log(
      stringify({
        status: "complete",
        testnet: "Base Sepolia",
        syntheticPrices: true,
        journal: journalPath,
        transactions: Object.keys(journal.transactions).length,
        buys: 4,
        sells: 4,
        shieldReceiptsClosed: 2,
        newCollateralReceiptClosed: 1,
        note: "Actual canonical Sepolia receipts; no real stock tokens or user-wallet signatures.",
      }),
    );
  } finally {
    release();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === ownPath)
  main().catch((error) => {
    console.error(
      `Demo smoke stopped: ${String(error.shortMessage ?? error.message ?? error.name)
        .replace(/0x[0-9a-fA-F]{64}/g, "<hash>")
        .replace(/https?:\/\/[^\s)]+/g, "<rpc>")
        .slice(0, 650)}. Review the separate journal before resuming.`,
    );
    process.exitCode = 1;
  });
