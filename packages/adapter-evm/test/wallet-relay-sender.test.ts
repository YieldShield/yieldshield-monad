import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccount, waitForTransactionReceipt, writeContract } from "@wagmi/core";
import { encodeAbiParameters, parseAbiParameters, type Address, type Hash, type PublicClient } from "viem";
import buyFixture from "./fixtures/metamask-buy.json";
import collateralFixture from "./fixtures/metamask-collateral.json";
import { sendEvmIntent } from "../src/react";
import { assertDemoTrade } from "../src/demo-trading";
import { assertDepositPreflight } from "../src/preflight";
vi.mock("../src/preflight", async (original) => ({ ...(await original()), assertDepositPreflight: vi.fn() }));

vi.mock("@wagmi/core", async (original) => ({
  ...(await original()),
  getAccount: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
}));
// Keep the actual plan builder, approval selection, canonical receipt verification
// and final Swapped-event extractor. Only current market preflight is stubbed: the
// captured public transaction's historical quote has necessarily expired today.
vi.mock("../src/demo-trading", async (original) => ({
  ...(await original()),
  assertDemoTrade: vi.fn(),
}));

const owner = buyFixture.owner as Address;
const exchange = "0x2d56dafd7b4760fd511af1346f85dbf845132e25" as Address;
const asset = "0xa301bab965098c9cfb72a270c80d818fa10444db" as Address;
const quoteToken = "0x4dfe9500e03ac27f25997184d162191cc5adbf34" as Address;
const intent = {
  kind: "demoTrade" as const,
  asset,
  side: "buy" as const,
  amount: 100000000n,
  limit: 0x5cbd909n,
  deadline: 0x6aa043e4n,
};
const connector = { uid: "metamask-relay", getAccounts: async () => [owner], getChainId: async () => 84532 };

type Fixture = typeof buyFixture;
function clientFor(fixture: Fixture) {
  return {
    getChainId: vi.fn(async () => 84532),
    simulateContract: vi.fn(async () => ({})),
    readContract: vi.fn(
      async ({ address, functionName, args }: { address: Address; functionName: string; args: readonly unknown[] }) => {
        expect(address.toLowerCase()).toBe(quoteToken);
        expect(functionName).toBe("allowance");
        expect(args).toEqual([owner, exchange]);
        return intent.limit;
      },
    ),
    request: vi.fn(async ({ method, params }: { method: string; params: unknown[] }) => {
      if (method === "eth_getTransactionReceipt") return fixture.receipt;
      if (method === "eth_getTransactionByHash") return fixture.transaction;
      if (method === "eth_getBlockByNumber") {
        if (params[0] === "latest") return fixture.head;
        if (params[1] === true) {
          return fixture.fullBlock;
        }
        return fixture.block;
      }
      if (method === "eth_getCode") {
        expect(params[1]).toBe(fixture.receipt.blockNumber);
        return fixture.codes[(params[0] as string).toLowerCase() as keyof typeof fixture.codes];
      }
      throw new Error(`Unexpected RPC method ${method}`);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAccount).mockReturnValue({ status: "connected", address: owner, chainId: 84532, connector } as never);
  vi.mocked(assertDemoTrade).mockResolvedValue({
    ...intent,
    owner,
    chainId: 84532,
    exchange,
    inputToken: quoteToken,
    outputToken: asset,
    inputAmount: 0x5c99125n,
    outputAmount: intent.amount,
    feeAmount: 0x46e71n,
    priceUsd8: 9681944444n,
    quotedAt: Number(intent.deadline - 120n),
    validUntil: Number(intent.deadline - 100n),
  });
  vi.mocked(writeContract).mockResolvedValue(buyFixture.transaction.hash as Hash);
  // Waiter data must never replace the canonical receipt used by the extractor.
  vi.mocked(waitForTransactionReceipt).mockResolvedValue({
    transactionHash: buyFixture.transaction.hash,
    logs: [],
  } as never);
});

function send(fixture: Fixture, onStep?: (step: unknown) => void) {
  const client = clientFor(fixture);
  const result = sendEvmIntent(
    {
      publicClient: client as unknown as PublicClient,
      chain: { id: 84532 },
      addresses: { factory: "0x600c46a5827b957caf3a8fd7a43cc4b24ab5a230" },
    } as never,
    {} as never,
    owner,
    intent,
    { onStep },
  );
  return { client, result };
}

describe("complete MetaMask relayed purchase sender", () => {
  it("returns success only after the actual planner, canonical proof and trade extractor accept the captured purchase", async () => {
    const progress: unknown[] = [];
    const { client, result } = send(structuredClone(buyFixture), (step) => progress.push(step));
    await expect(result).resolves.toEqual({ txId: buyFixture.transaction.hash });
    expect(assertDemoTrade).toHaveBeenCalledTimes(2);
    expect(client.readContract).toHaveBeenCalledTimes(1);
    expect(client.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: exchange,
        account: owner,
        functionName: "swap",
        args: [asset, true, intent.amount, intent.limit, intent.deadline],
      }),
    );
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        address: exchange,
        account: owner,
        chainId: 84532,
        functionName: "swap",
        args: [asset, true, intent.amount, intent.limit, intent.deadline],
        connector,
      }),
    );
    expect(progress).toEqual([
      { index: 1, total: 1, label: "Buy test stock" },
      { index: 1, total: 1, label: "Buy test stock", awaitingWallet: true },
      { index: 1, total: 1, label: "Buy test stock", txId: buyFixture.transaction.hash },
    ]);
  });

  it.each(["missing", "wrong-trader", "wrong-stock", "wrong-direction", "wrong-amount", "over-limit", "zero-payment"])(
    "does not return success for valid relay execution with %s trade evidence",
    async (change) => {
      const fixture = structuredClone(buyFixture);
      const trade = fixture.receipt.logs.find((log) => log.address === exchange)!;
      if (change === "missing") fixture.receipt.logs = fixture.receipt.logs.filter((log) => log !== trade);
      if (change === "wrong-trader") trade.topics[1] = `0x${"0".repeat(24)}${exchange.slice(2)}`;
      if (change === "wrong-stock") trade.topics[2] = `0x${"0".repeat(24)}${quoteToken.slice(2)}`;
      if (["wrong-direction", "wrong-amount", "over-limit", "zero-payment"].includes(change)) {
        trade.data = encodeAbiParameters(parseAbiParameters("bool, uint256, uint256, uint256"), [
          change !== "wrong-direction",
          change === "wrong-amount" ? intent.amount + 1n : intent.amount,
          change === "over-limit" ? intent.limit + 1n : change === "zero-payment" ? 0n : 0x5c99125n,
          0x46e71n,
        ]);
      }
      const { result } = send(fixture);
      await expect(result).rejects.toThrow("receipt does not confirm the reviewed stock trade");
      expect(writeContract).toHaveBeenCalledTimes(1);
    },
  );
});

describe("complete MetaMask nested collateral sender", () => {
  const collateralPool = "0xdca629732d8122e5b3bb391dc3727a8f5ecbc3e9" as Address;
  const nft = "0xa1facf01642c825d71ea299abf1f21e5f13f87cf" as Address;
  const deposit = {
    kind: "depositBacking" as const,
    pool: collateralPool,
    backingToken: quoteToken,
    amount: 1000000000n,
    minReceived: 995000000n,
  };
  it.each(["valid", "missing-nft", "wrong-owner"])("uses canonical position evidence (%s)", async (scenario) => {
    const fixture = structuredClone(collateralFixture) as Fixture;
    const minted = fixture.receipt.logs.find((log) => log.address === nft && log.topics.length === 4)!;
    if (scenario === "missing-nft") fixture.receipt.logs = fixture.receipt.logs.filter((log) => log !== minted);
    if (scenario === "wrong-owner") minted.topics[2] = `0x${"0".repeat(24)}${exchange.slice(2)}`;
    const client = clientFor(fixture);
    client.readContract.mockImplementation(async ({ functionName }) => {
      if (functionName === "getPoolInfo") return { backingToken: quoteToken } as never;
      if (functionName === "allowance") return deposit.amount;
      if (functionName === "protectorReceiptNFT") return nft as never;
      throw new Error(`Unexpected pool read ${functionName}`);
    });
    vi.mocked(assertDepositPreflight).mockResolvedValue(undefined);
    vi.mocked(writeContract).mockResolvedValue(fixture.transaction.hash as Hash);
    vi.mocked(waitForTransactionReceipt).mockResolvedValue({
      transactionHash: fixture.transaction.hash,
      logs: [],
    } as never);
    const result = sendEvmIntent(
      {
        publicClient: client as unknown as PublicClient,
        chain: { id: 84532 },
        addresses: { factory: "0x600c46a5827b957caf3a8fd7a43cc4b24ab5a230" },
      } as never,
      {} as never,
      owner,
      deposit,
    );
    if (scenario === "valid")
      await expect(result).resolves.toEqual({ txId: fixture.transaction.hash, positionId: `${collateralPool}-p-1` });
    else await expect(result).rejects.toThrow("expected collateral position");
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        address: collateralPool,
        account: owner,
        functionName: "depositBackingAsset",
        args: [quoteToken, deposit.amount, deposit.minReceived],
      }),
    );
    expect(assertDepositPreflight).toHaveBeenCalledTimes(2);
  });
});
