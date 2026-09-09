/** Pure smoke safety regressions. No RPC client, signer, environment file or broadcast path is invoked. */
import test from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, encodeEventTopics, encodeAbiParameters, parseAbi } from "viem";
import { assertSmokeOperation, receiptTokenFlows, verifySmokeJournal } from "./smoke-base-demo.mjs";

const address = (n) => "0x" + n.toString(16).padStart(40, "0");
const pool = address(1),
  usd = { testToken: address(2) },
  exchange = address(3),
  faucet = address(4),
  owner = address(5);
const stocks = ["tAAPLc", "tNVDAc", "tMETAc", "tGOOGLc"].map((symbol, i) => ({ symbol, testToken: address(6 + i) }));
const context = {
  pool,
  usd,
  exchange,
  faucet,
  owner,
  stocks,
  positions: {
    "stock-deposit": { position: `${pool}-s-9`, tokenId: 9n },
    "collateral-deposit": { position: `${pool}-p-7`, tokenId: 7n },
    "protected-deposit": { position: `${pool}-s-10`, tokenId: 10n },
  },
};
const abi = parseAbi([
  "function approve(address,uint256)",
  "function swap(address,bool,uint256,uint256,uint256)",
  "function depositShieldedAsset(address,uint256,uint256)",
  "function depositBackingAsset(address,uint256,uint256)",
  "function shieldedWithdraw(uint256,address,uint256)",
  "function protectorWithdraw(uint256,uint256,address,uint256)",
  "function startUnlockProcess(uint256)",
  "function dripAll(address)",
]);
const calldata = (functionName, args) => encodeFunctionData({ abi, functionName, args });
const persisted = (value) =>
  JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? String(item) : item)));
const operation = (id, intent, calls) => ({
  intent: persisted(intent),
  attempt: 0,
  steps: calls.map(([to, functionName, args], i) => ({
    id: `${id}:attempt0:step${i}`,
    to,
    data: calldata(functionName, args),
  })),
});
function trade(asset = stocks[0], side = "buy") {
  const id = `${asset.symbol}:${side}`,
    buy = side === "buy",
    amount = 100000000n,
    limit = 101000000n,
    deadline = 1999999999n;
  return {
    id,
    op: operation(id, { kind: "demoTrade", asset: asset.testToken, side, amount, limit, deadline }, [
      [buy ? usd.testToken : asset.testToken, "approve", [exchange, buy ? limit : amount]],
      [exchange, "swap", [asset.testToken, buy, amount, limit, deadline]],
    ]),
  };
}
function rejectChange(id, op, change, message) {
  const changed = structuredClone(op);
  change(changed);
  assert.throws(() => assertSmokeOperation(id, changed, context), message);
}

test("each reviewed stock can buy and sell with journal-restored bigint amounts", () => {
  for (const asset of stocks)
    for (const side of ["buy", "sell"]) {
      const { id, op } = trade(asset, side);
      assertSmokeOperation(id, op, context);
    }
});

test("unsigned approvals cannot change token, spender or bounded amount", () => {
  const { id, op } = trade();
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[0].to = address(99);
    },
    /approval/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[0].data = calldata("approve", [address(99), 101000000n]);
    },
    /approval/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[0].data = calldata("approve", [exchange, 2n ** 256n - 1n]);
    },
    /approval/,
  );
});

test("an allowance reset must precede the exact bounded approval", () => {
  const { id, op } = trade();
  op.steps.unshift({ id: "", to: usd.testToken, data: calldata("approve", [exchange, 0n]) });
  op.steps.forEach((step, i) => {
    step.id = `${id}:attempt0:step${i}`;
  });
  assertSmokeOperation(id, op, context);
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[0].data = calldata("approve", [exchange, 101000000n]);
    },
    /approval/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[1].data = calldata("approve", [exchange, 0n]);
    },
    /approval/,
  );
});

test("trade call and intent remain bound to their reviewed asset, amount and side", () => {
  const { id, op } = trade();
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[1].to = address(99);
    },
    /calldata/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[1].data = calldata("swap", [stocks[1].testToken, true, 100000000n, 101000000n, 1999999999n]);
    },
    /calldata/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[1].data = calldata("swap", [stocks[0].testToken, true, 200000000n, 101000000n, 1999999999n]);
    },
    /calldata/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.intent.amount = "200000000";
    },
    /amount/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.intent.asset = stocks[1].testToken;
    },
    /asset/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.intent.side = "sell";
    },
    /side/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.intent.recipient = address(99);
    },
    /fields/,
  );
});

test("editable journals cannot extend the trade budget or retry count", () => {
  const { id, op } = trade();
  for (const limit of ["0", "69999999", "300000001"])
    rejectChange(
      id,
      op,
      (saved) => {
        saved.intent.limit = limit;
      },
      /bounds/,
    );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.attempt = 2;
    },
    /attempts/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[0].id = "unrelated-operation:step0";
    },
    /identity/,
  );
  assert.throws(() => assertSmokeOperation("unbounded-third-buy", op, context), /Unknown/);
});

test("fresh collateral and shield deposits use exact amounts and their expected token", () => {
  for (const id of ["collateral-deposit", "stock-deposit", "protected-deposit"]) {
    const shield = id !== "collateral-deposit",
      token = shield ? stocks[0].testToken : usd.testToken;
    const op = operation(
      id,
      {
        kind: shield ? "depositShielded" : "depositBacking",
        pool,
        backingToken: usd.testToken,
        amount: 100000000n,
        minReceived: 100000000n,
        ...(shield ? { shieldedToken: token } : {}),
      },
      [
        [token, "approve", [pool, 100000000n]],
        [pool, shield ? "depositShieldedAsset" : "depositBackingAsset", [token, 100000000n, 100000000n]],
      ],
    );
    assertSmokeOperation(id, op, context);
    rejectChange(
      id,
      op,
      (saved) => {
        saved.intent.pool = address(99);
      },
      /pool/,
    );
    rejectChange(
      id,
      op,
      (saved) => {
        saved.intent.amount = "200000000";
      },
      /amount/,
    );
    rejectChange(
      id,
      op,
      (saved) => {
        saved.intent.minReceived = "1";
      },
      /minReceived/,
    );
  }
});

test("the faucet claim is bound to the reviewed faucet and dedicated deployer recipient", () => {
  const id = "faucet-claim",
    op = operation(id, { kind: "faucetDrip", recipient: owner }, [[faucet, "dripAll", [owner]]]);
  assertSmokeOperation(id, op, context);
  rejectChange(
    id,
    op,
    (saved) => {
      saved.intent.recipient = address(99);
    },
    /recipient/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[0].to = address(99);
    },
    /calldata/,
  );
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[0].data = calldata("dripAll", [address(99)]);
    },
    /calldata/,
  );
});

const exits = [
  [
    "stock-exit",
    { kind: "withdrawShielded", pool, position: `${pool}-s-9`, shieldedToken: stocks[0].testToken, minOut: 90000000n },
    "shieldedWithdraw",
    [9n, stocks[0].testToken, 90000000n],
  ],
  [
    "protected-exit",
    {
      kind: "activateShielded",
      pool,
      position: `${pool}-s-10`,
      shieldedToken: stocks[0].testToken,
      backingToken: usd.testToken,
      minOut: 100000000n,
    },
    "shieldedWithdraw",
    [10n, usd.testToken, 100000000n],
  ],
  [
    "collateral-exit",
    { kind: "withdrawProtector", pool, position: `${pool}-p-7`, backingToken: usd.testToken, minOut: 90000000n },
    "protectorWithdraw",
    [7n, 100000000n, usd.testToken, 90000000n],
  ],
];
test("exits cannot substitute an existing unrelated receipt or another payout token", () => {
  for (const [id, intent, fn, args] of exits) {
    const op = operation(id, intent, [[pool, fn, args]]);
    assertSmokeOperation(id, op, context);
    rejectChange(
      id,
      op,
      (saved) => {
        saved.intent.position = `${pool}-s-12345`;
      },
      /position/,
    );
    rejectChange(
      id,
      op,
      (saved) => {
        const changed = [...args];
        changed[0] = 12345n;
        saved.steps[0].data = calldata(fn, changed);
      },
      /calldata/,
    );
    rejectChange(
      id,
      op,
      (saved) => {
        const changed = [...args];
        changed[id === "collateral-exit" ? 2 : 1] = address(99);
        saved.steps[0].data = calldata(fn, changed);
      },
      /calldata/,
    );
    assert.throws(() => assertSmokeOperation(id, op, { ...context, positions: {} }), /receipt/);
  }
});

test("collateral unlock and withdrawal apply only to the new bounded collateral receipt", () => {
  const id = "collateral-unlock",
    op = operation(id, { kind: "startUnlock", position: `${pool}-p-7` }, [[pool, "startUnlockProcess", [7n]]]);
  assertSmokeOperation(id, op, context);
  rejectChange(
    id,
    op,
    (saved) => {
      saved.steps[0].data = calldata("startUnlockProcess", [1n]);
    },
    /calldata/,
  );
  const [exitId, intent, fn, args] = exits[2],
    withdrawal = operation(exitId, intent, [[pool, fn, args]]);
  for (const amount of [0n, 110000001n])
    rejectChange(
      exitId,
      withdrawal,
      (saved) => {
        saved.steps[0].data = calldata(fn, [7n, amount, usd.testToken, 90000000n]);
      },
      /bounds/,
    );
});

test("receipt-scoped flows count only the expected tokens and recipient", () => {
  const transferAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
  const log = (token, from, to, value) => ({
    address: token,
    topics: encodeEventTopics({ abi: transferAbi, eventName: "Transfer", args: { from, to } }),
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
  });
  const flows = receiptTokenFlows(
    {
      logs: [
        log(usd.testToken, exchange, owner, 123n),
        log(usd.testToken, owner, exchange, 5n),
        log(address(99), exchange, owner, 999n),
        log(usd.testToken, exchange, address(98), 777n),
      ],
    },
    owner,
    [usd.testToken, stocks[0].testToken],
  );
  assert.deepEqual(flows[usd.testToken.toLowerCase()], { received: 123n, sent: 5n });
  assert.deepEqual(flows[stocks[0].testToken.toLowerCase()], { received: 0n, sent: 0n });
  assert.equal(Object.keys(flows).length, 2);
});

test("journal identity cannot change chain, dedicated signer, deployment or compiled recipe", () => {
  const journal = {
    kind: "base-sepolia-demo-smoke-v1",
    chainId: 84532,
    deployer: "0xA437345Be29EC6802024A8e090E34b621b92E5E2",
    manifestDigest: "manifest",
    recipeHash: "recipe",
    transactions: {},
    operations: {},
    evidence: {},
  };
  verifySmokeJournal(journal, "manifest", "recipe");
  for (const change of [{ chainId: 8453 }, { deployer: address(99) }, { kind: "other-smoke" }, { operations: null }])
    assert.throws(() => verifySmokeJournal({ ...journal, ...change }, "manifest", "recipe"));
  assert.throws(() => verifySmokeJournal(journal, "changed", "recipe"), /deployment/);
  assert.throws(() => verifySmokeJournal(journal, "manifest", "changed"), /recipe/);
  assert.throws(
    () =>
      verifySmokeJournal(
        { ...journal, transactions: Object.fromEntries(Array.from({ length: 61 }, (_, i) => [String(i), {}])) },
        "manifest",
        "recipe",
      ),
    /bound/,
  );
});
