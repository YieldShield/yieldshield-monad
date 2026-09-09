import * as viem from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  encodeAbiParameters,
  encodeFunctionData,
  decodeAbiParameters,
  decodeFunctionData,
  parseAbi,
  zeroHash,
  toHex,
  type PublicClient,
  type Address,
  type Hash,
} from "viem";
import { getAccount, waitForTransactionReceipt, writeContract } from "@wagmi/core";
import buyFixture from "./fixtures/metamask-buy.json";
import approvalFixture from "./fixtures/metamask-protection.json";
import collateralFixture from "./fixtures/metamask-collateral.json";
import { readCanonicalStepReceipt, sendEvmIntent } from "../src/react";
import {
  delegationManagerAbi,
  delegationParameters,
  METAMASK_EXECUTION,
  assertStableWalletCodeAtExecution,
} from "../src/wallet-execution";
import { planIntent, type EvmStep } from "../src/intents";

vi.mock("viem", async (original) => {
  const actual = await original<typeof import("viem")>();
  return { ...actual, recoverAddress: vi.fn(actual.recoverAddress) };
});
vi.mock("@wagmi/core", async (original) => ({
  ...(await original()),
  getAccount: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
}));
vi.mock("../src/intents", async (original) => ({ ...(await original()), planIntent: vi.fn() }));
const owner = buyFixture.owner as Address;
const buy: EvmStep = {
  label: "Buy test stock",
  address: "0x2d56dafd7b4760fd511af1346f85dbf845132e25",
  abi: parseAbi(["function swap(address asset, bool buy, uint256 amount, uint256 limit, uint256 deadline)"]),
  functionName: "swap",
  args: ["0xa301bab965098c9cfb72a270c80d818fa10444db", true, 100000000n, 0x5cbd909n, 0x6aa043e4n],
};
const approval: EvmStep = {
  label: "Approve spending",
  address: "0xa301bab965098c9cfb72a270c80d818fa10444db",
  abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
  functionName: "approve",
  args: ["0xe21292bb5545cc6079e88e5a56b83b94fa3f7174", 500000000n],
};
const collateral: EvmStep = {
  label: "Deposit collateral",
  address: "0xdca629732d8122e5b3bb391dc3727a8f5ecbc3e9",
  abi: parseAbi([
    "function depositBackingAsset(address asset, uint256 depositAmount, uint256 minReceivedAmount) returns (uint256)",
  ]),
  functionName: "depositBackingAsset",
  args: ["0x4dfe9500e03ac27f25997184d162191cc5adbf34", 1000000000n, 995000000n],
};
type Fixture = typeof buyFixture;
function clientFor(fixture: Fixture) {
  return {
    getChainId: vi.fn(async () => 84532),
    simulateContract: vi.fn(async () => ({})),
    request: vi.fn(async ({ method, params }: { method: string; params: (string | boolean)[] }) => {
      if (method === "eth_getTransactionReceipt") return fixture.receipt;
      if (method === "eth_getTransactionByHash") return fixture.transaction;
      if (method === "eth_getBlockByNumber")
        return params[0] === "latest" ? fixture.head : params[1] === true ? fixture.fullBlock : fixture.block;
      if (method === "eth_getCode") {
        expect(params[1]).toBe(fixture.receipt.blockNumber);
        return fixture.codes[String(params[0]).toLowerCase() as keyof typeof fixture.codes];
      }
      throw new Error(`Unexpected RPC method ${method}`);
    }),
  };
}
function verify(fixture = structuredClone(buyFixture), step = buy, wallet = owner, chainId = 84532) {
  const client = clientFor(fixture);
  return readCanonicalStepReceipt(
    client as unknown as PublicClient,
    fixture.transaction.hash as Hash,
    wallet,
    step,
    chainId,
  );
}
function alterCall(
  fixture: Fixture,
  change: (args: ReturnType<typeof decodeFunctionData<typeof delegationManagerAbi>>["args"]) => unknown,
) {
  const { args } = decodeFunctionData({ abi: delegationManagerAbi, data: fixture.transaction.input as Hash });
  fixture.transaction.input = encodeFunctionData({
    abi: delegationManagerAbi,
    functionName: "redeemDelegations",
    args: change(args) as typeof args,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe("reported MetaMask transaction confirmations", () => {
  it.each([
    ["purchase", buyFixture, buy],
    ["protection spending approval", approvalFixture, approval],
    ["nested collateral deposit", collateralFixture, collateral],
  ] as const)("accepts the actual canonical %s receipt with its exact reviewed call", async (_, fixture, step) => {
    const result = await verify(structuredClone(fixture) as Fixture, step);
    expect(result.status).toBe("success");
    expect(result.transactionHash).toBe(fixture.transaction.hash);
    expect(result.logs).toHaveLength(fixture.receipt.logs.length);
  });
  it.each([
    ["asset", 0],
    ["amount", 1],
    ["minimum", 2],
  ] as const)("rejects changed nested collateral %s", async (_, index) => {
    const args = [...collateral.args];
    args[index] = index === 0 ? owner : 1n;
    await expect(verify(structuredClone(collateralFixture) as Fixture, { ...collateral, args })).rejects.toThrow(
      "reviewed action",
    );
  });
  it.each(["mode", "value", "target", "delegate", "root", "extra-call", "trailing"])(
    "rejects an unsupported nested wallet execution (%s)",
    async (field) => {
      const f = structuredClone(collateralFixture) as Fixture;
      alterCall(f, ([outerContexts, outerModes, outerCalls]) => {
        const prefix = outerCalls[0]!.slice(0, 106);
        const inner = decodeFunctionData({ abi: delegationManagerAbi, data: `0x${outerCalls[0]!.slice(106)}` });
        let [contexts, modes, calls] = inner.args;
        if (field === "mode") modes = [`0x00${"01"}${"00".repeat(30)}`];
        if (field === "value") calls = [(calls[0]!.slice(0, 104) + "01" + calls[0]!.slice(106)) as Hash];
        if (field === "target") calls = [(owner + calls[0]!.slice(42)) as Hash];
        if (field === "delegate" || field === "root") {
          const [delegations] = decodeAbiParameters(delegationParameters, contexts[0]!);
          contexts = [
            encodeAbiParameters(delegationParameters, [
              [
                {
                  ...delegations[0]!,
                  ...(field === "delegate"
                    ? { delegate: METAMASK_EXECUTION.manager }
                    : { delegator: METAMASK_EXECUTION.manager }),
                },
              ],
            ]),
          ];
        }
        if (field === "extra-call") {
          contexts = [...contexts, ...contexts];
          modes = [...modes, ...modes];
          calls = [...calls, ...calls];
        }
        let nested = encodeFunctionData({
          abi: delegationManagerAbi,
          functionName: "redeemDelegations",
          args: [contexts, modes, calls],
        });
        if (field === "trailing") nested = `${nested}00`;
        return [outerContexts, outerModes, [`${prefix}${nested.slice(2)}`]];
      });
      await expect(verify(f, collateral)).rejects.toThrow();
    },
  );
  it.each([4, 5])("bounds nested wallet execution to four layers (%i)", async (depth) => {
    const f = structuredClone(collateralFixture) as Fixture;
    const innerEvent = structuredClone(f.receipt.logs.at(-2)!);
    alterCall(f, ([contexts, modes, calls]) => {
      const prefix = calls[0]!.slice(0, 106);
      let nested = `0x${calls[0]!.slice(106)}` as Hash;
      const inner = decodeFunctionData({ abi: delegationManagerAbi, data: nested });
      // Synthetic receipt shape tests the recursion boundary only; it is never broadcast.
      for (let i = 2; i < depth; i++)
        nested = encodeFunctionData({
          abi: delegationManagerAbi,
          functionName: "redeemDelegations",
          args: [inner.args[0], inner.args[1], [`${prefix}${nested.slice(2)}` as Hash]],
        });
      return [contexts, modes, [`${prefix}${nested.slice(2)}`]];
    });
    for (let i = 2; i < depth; i++) f.receipt.logs.splice(-1, 0, structuredClone(innerEvent));
    f.receipt.logs.forEach((log, i) => {
      log.logIndex = toHex(i + 6);
    });
    if (depth === 4) await expect(verify(f, collateral)).resolves.toMatchObject({ status: "success" });
    else await expect(verify(f, collateral)).rejects.toThrow("nesting exceeds");
  });
  it.each(["missing-inner", "missing-outer", "wrong-inner-redeemer", "reordered", "duplicate"])(
    "requires both nested redemption proofs (%s)",
    async (field) => {
      const f = structuredClone(collateralFixture) as Fixture;
      const inner = f.receipt.logs.at(-2)!;
      const outer = f.receipt.logs.at(-1)!;
      if (field === "missing-inner") f.receipt.logs.splice(-2, 1);
      if (field === "missing-outer") f.receipt.logs.pop();
      if (field === "wrong-inner-redeemer") inner.topics[2] = outer.topics[2]!;
      if (field === "reordered") {
        const old = inner.data;
        inner.data = outer.data;
        outer.data = old;
      }
      if (field === "duplicate") f.receipt.logs.push({ ...inner, logIndex: "0xd" });
      await expect(verify(f, collateral)).rejects.toThrow("redemption");
    },
  );
  it.each([
    ["asset", 0],
    ["direction", 1],
    ["amount", 2],
    ["limit", 3],
    ["deadline", 4],
  ] as const)("rejects a changed reviewed %s", async (_, index) => {
    const args = [...buy.args];
    args[index] = index === 0 ? owner : index === 1 ? false : 1n;
    await expect(verify(structuredClone(buyFixture), { ...buy, args })).rejects.toThrow("reviewed action");
  });
  it("rejects a different reviewed target or wallet", async () => {
    await expect(verify(structuredClone(buyFixture), { ...buy, address: owner })).rejects.toThrow("reviewed action");
    await expect(verify(structuredClone(buyFixture), buy, METAMASK_EXECUTION.manager)).rejects.toThrow("authorize");
  });
  it.each([`0x00${"01"}${"00".repeat(30)}`, `0x01${"00".repeat(31)}`, `0xff${"00".repeat(31)}`])(
    "rejects non-mandatory/single execution mode %s",
    async (mode) => {
      const f = structuredClone(buyFixture);
      alterCall(f, ([contexts, , calls]) => [contexts, [mode], calls]);
      await expect(verify(f)).rejects.toThrow("mandatory single-call");
    },
  );
  it("rejects extra executions in a relayer transaction", async () => {
    const f = structuredClone(buyFixture);
    alterCall(f, ([contexts, modes, calls]) => [
      [...contexts, ...contexts],
      [...modes, ...modes],
      [...calls, ...calls],
    ]);
    await expect(verify(f)).rejects.toThrow("one mandatory");
  });
  it("rejects altered inner native value and trailing calldata", async () => {
    for (const change of [
      (call: string) => call.slice(0, 104) + "01" + call.slice(106),
      (call: string) => call + "00",
    ]) {
      const f = structuredClone(buyFixture);
      alterCall(f, ([contexts, modes, calls]) => [contexts, modes, [change(calls[0]!)]]);
      await expect(verify(f)).rejects.toThrow("inner call");
    }
  });
  it.each(["root", "authority", "delegate", "empty"])("rejects an unauthorized delegation (%s)", async (field) => {
    const f = structuredClone(buyFixture);
    alterCall(f, ([contexts, modes, calls]) => {
      const [delegations] = decodeAbiParameters(delegationParameters, contexts[0]!);
      const root = { ...delegations[0]! };
      if (field === "root") root.delegator = METAMASK_EXECUTION.manager;
      if (field === "authority") root.authority = zeroHash;
      if (field === "delegate") root.delegate = owner;
      return [[encodeAbiParameters(delegationParameters, [field === "empty" ? [] : [root]])], modes, calls];
    });
    await expect(verify(f)).rejects.toThrow("authorize");
  });
  it.each([METAMASK_EXECUTION.manager, owner, METAMASK_EXECUTION.implementation])(
    "rejects changed historical code at %s",
    async (address) => {
      const f = structuredClone(buyFixture);
      f.codes[address as keyof typeof f.codes] = "0x6000";
      await expect(verify(f)).rejects.toThrow("historical wallet execution code");
    },
  );
  it("rejects unsupported relayers and networks", async () => {
    const f = structuredClone(buyFixture);
    f.receipt.to = owner;
    f.transaction.to = owner;
    await expect(verify(f)).rejects.toThrow("reviewed action");
    await expect(verify(structuredClone(buyFixture), buy, owner, 8453)).rejects.toThrow("reviewed action");
  });
  it.each(["missing", "wrong-emitter", "wrong-owner", "wrong-redeemer", "changed-signature", "duplicate"])(
    "requires matching canonical redemption evidence (%s)",
    async (field) => {
      const f = structuredClone(buyFixture);
      const event = f.receipt.logs.at(-1)!;
      if (field === "missing") f.receipt.logs.pop();
      if (field === "wrong-emitter") event.address = owner;
      if (field === "wrong-owner") event.topics[1] = zeroHash;
      if (field === "wrong-redeemer") event.topics[2] = zeroHash;
      if (field === "changed-signature") {
        alterCall(f, ([contexts, modes, calls]) => {
          const [delegations] = decodeAbiParameters(delegationParameters, contexts[0]!);
          return [
            [encodeAbiParameters(delegationParameters, [[{ ...delegations[0]!, signature: "0x12" }]])],
            modes,
            calls,
          ];
        });
      }
      if (field === "duplicate") f.receipt.logs.push({ ...event, logIndex: "0x2e" });
      await expect(verify(f)).rejects.toThrow("redemption");
    },
  );
  it.each(["revert", "preconfirmation", "changed-block", "value", "outer-identity", "unsealed-head"])(
    "retains outer canonical evidence checks (%s)",
    async (field) => {
      const f = structuredClone(buyFixture);
      if (field === "revert") f.receipt.status = "0x0";
      if (field === "preconfirmation") f.receipt.blockHash = zeroHash;
      if (field === "changed-block") f.block.hash = zeroHash;
      if (field === "value") f.transaction.value = "0x1";
      if (field === "outer-identity") f.transaction.from = owner;
      if (field === "unsealed-head") f.head.hash = zeroHash;
      await expect(verify(f)).rejects.toThrow();
    },
  );
  it("rejects a reorg during historical execution-code verification", async () => {
    const f = structuredClone(buyFixture);
    const client = clientFor(f);
    const request = client.request.getMockImplementation()!;
    client.request.mockImplementation(async (params) => {
      const result = await request(params);
      if (params.method === "eth_getCode") f.block.hash = zeroHash;
      return result;
    });
    await expect(
      readCanonicalStepReceipt(client as unknown as PublicClient, f.transaction.hash as Hash, owner, buy, 84532),
    ).rejects.toThrow("canonical block");
  });
  it("continues past the actual relayed approval to the next wallet request", async () => {
    const client = clientFor(structuredClone(approvalFixture) as Fixture);
    const connector = { uid: "metamask-test", getAccounts: async () => [owner], getChainId: async () => 84532 };
    vi.mocked(getAccount).mockReturnValue({ status: "connected", address: owner, chainId: 84532, connector } as never);
    vi.mocked(planIntent).mockResolvedValue({ steps: [approval, buy], beforeStep: vi.fn() });
    vi.mocked(writeContract)
      .mockResolvedValueOnce(approvalFixture.transaction.hash as Hash)
      .mockRejectedValueOnce(new Error("User rejected the next signature"));
    vi.mocked(waitForTransactionReceipt).mockResolvedValue({
      transactionHash: approvalFixture.transaction.hash,
    } as never);
    await expect(
      sendEvmIntent({ publicClient: client, chain: { id: 84532 }, addresses: {} } as never, {} as never, owner, {
        kind: "faucetAll",
      } as never),
    ).rejects.toThrow("next signature");
    expect(writeContract).toHaveBeenCalledTimes(2);
    expect(client.simulateContract).toHaveBeenCalledTimes(2);
  });
});

describe("execution-time wallet code", () => {
  // Public deterministic test key: signs local test data only, never a network request.
  const testSigner = privateKeyToAccount(`0x${"11".repeat(32)}`);
  async function authorization(chainId = 84532) {
    const auth = await testSigner.signAuthorization({
      contractAddress: METAMASK_EXECUTION.implementation,
      chainId,
      nonce: 0,
    });
    return { ...auth, chainId: toHex(auth.chainId), nonce: toHex(auth.nonce), yParity: toHex(auth.yParity) };
  }
  it("rejects a later redelegation of the same wallet, even to the expected implementation", async () => {
    const f = structuredClone(buyFixture);
    f.fullBlock.transactions.push({ hash: zeroHash, type: "0x4", authorizationList: [await authorization()] } as never);
    await expect(
      assertStableWalletCodeAtExecution(
        clientFor(f) as unknown as PublicClient,
        f.receipt as never,
        testSigner.address,
        84532,
      ),
    ).rejects.toThrow("redelegated later");
  });
  it("allows other wallets to upgrade later in the same block", async () => {
    const f = structuredClone(buyFixture);
    f.fullBlock.transactions.push({ hash: zeroHash, type: "0x4", authorizationList: [await authorization()] } as never);
    await expect(verify(f)).resolves.toMatchObject({ status: "success" });
  });
  it("allows an authorization processed before the execution", async () => {
    const f = structuredClone(buyFixture);
    f.fullBlock.transactions[0] = { hash: zeroHash, type: "0x4", authorizationList: [await authorization()] } as never;
    await expect(
      assertStableWalletCodeAtExecution(
        clientFor(f) as unknown as PublicClient,
        f.receipt as never,
        testSigner.address,
        84532,
      ),
    ).resolves.toBeUndefined();
  });
  it("ignores authorization tuples that cannot apply on this chain", async () => {
    const f = structuredClone(buyFixture);
    f.fullBlock.transactions.push({
      hash: zeroHash,
      type: "0x4",
      authorizationList: [await authorization(8453)],
    } as never);
    await expect(
      assertStableWalletCodeAtExecution(
        clientFor(f) as unknown as PublicClient,
        f.receipt as never,
        testSigner.address,
        84532,
      ),
    ).resolves.toBeUndefined();
  });
  it("also rejects chain-agnostic later authorizations from this wallet", async () => {
    const f = structuredClone(buyFixture);
    f.fullBlock.transactions.push({
      hash: zeroHash,
      type: "0x4",
      authorizationList: [await authorization(0)],
    } as never);
    await expect(
      assertStableWalletCodeAtExecution(
        clientFor(f) as unknown as PublicClient,
        f.receipt as never,
        testSigner.address,
        84532,
      ),
    ).rejects.toThrow("redelegated later");
  });
  it.each(["zero-r", "zero-s", "unrecoverable-point", "invalid-parity", "high-s", "maximum-nonce"])(
    "ignores protocol-invalid later authorization tuples (%s)",
    async (field) => {
      const f = structuredClone(buyFixture);
      const auth = await authorization();
      if (field === "zero-r") auth.r = "0x0";
      if (field === "unrecoverable-point") {
        auth.r = toHex(5n, { size: 32 });
        auth.s = toHex(1n, { size: 32 });
      }
      if (field === "zero-s") auth.s = "0x0";
      if (field === "invalid-parity") auth.yParity = "0x2";
      if (field === "high-s") auth.s = `0x${"f".repeat(64)}`;
      if (field === "maximum-nonce") auth.nonce = "0xffffffffffffffff";
      f.fullBlock.transactions.push({ hash: zeroHash, type: "0x4", authorizationList: [auth] } as never);
      await expect(
        assertStableWalletCodeAtExecution(
          clientFor(f) as unknown as PublicClient,
          f.receipt as never,
          testSigner.address,
          84532,
        ),
      ).resolves.toBeUndefined();
    },
  );
  it("does not hide a failed crypto module load as an invalid signature", async () => {
    const f = structuredClone(buyFixture);
    const auth = await authorization();
    f.fullBlock.transactions.push({ hash: zeroHash, type: "0x4", authorizationList: [auth] } as never);
    vi.mocked(viem.recoverAddress).mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"));
    await expect(verify(f)).rejects.toThrow("authorization recovery is unavailable");
  });
  it("rejects malformed or incomplete authorization metadata", async () => {
    const f = structuredClone(buyFixture);
    f.fullBlock.transactions.push({
      hash: zeroHash,
      type: "0x4",
      authorizationList: [{ ...(await authorization()), r: undefined }],
    } as never);
    await expect(verify(f)).rejects.toThrow("metadata is malformed");
  });
  it.each(["wrong-block", "missing-type", "missing-authorizations", "unsupported-type"])(
    "fails closed on incomplete full-block evidence (%s)",
    async (field) => {
      const f = structuredClone(buyFixture);
      if (field === "wrong-block") f.fullBlock.hash = zeroHash;
      else
        f.fullBlock.transactions.push({
          hash: zeroHash,
          ...(field === "missing-type" ? {} : { type: field === "unsupported-type" ? "0x5" : "0x4" }),
        } as never);
      await expect(verify(f)).rejects.toThrow();
    },
  );
});
