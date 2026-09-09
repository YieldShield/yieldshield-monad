import { beforeEach, describe, expect, it, vi } from "vitest";
import { zeroAddress, zeroHash, encodeFunctionData, encodeEventTopics, encodeAbiParameters } from "viem";
import { erc721TransferEventAbi } from "../src/abis/erc20";
import { tokenFaucetAbi } from "../src/abis/tokenFaucet";
import { splitRiskPoolAbi } from "../src/abis/splitRiskPool";
import { planIntent } from "../src/intents";
import { createReader, netShieldAmount, maximumDeposit } from "../src/reader";
import { assertWalletSession, sendEvmIntent, readCanonicalStepReceipt } from "../src/react";
import { encodePositionId } from "../src/positionId";
import { friendlyError } from "../src/errors";
import { getAccount, waitForTransactionReceipt, writeContract } from "@wagmi/core";

vi.mock("@wagmi/core", async (original) => ({
  ...(await original()),
  getAccount: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
}));
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
});

const owner = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const pool = "0x3333333333333333333333333333333333333333";
const shielded = "0x4444444444444444444444444444444444444444";
const backing = "0x5555555555555555555555555555555555555555";
const factory = "0x6666666666666666666666666666666666666666";
const oracle = "0x7777777777777777777777777777777777777777";
const shieldNft = "0x8888888888888888888888888888888888888888";
const protectorNft = "0x9999999999999999999999999999999999999999";
const txHash = `0x${"a".repeat(64)}`;
const info = {
  shieldedToken: shielded,
  backingToken: backing,
  shieldedTokenSymbol: "tSTOCK",
  backingTokenSymbol: "tUSD",
  commissionRate: 2000n,
  poolFee: 100n,
  colleteralRatio: 15000n,
  createdAt: 1n,
  creator: owner,
};
const deps = { factory, compositeOracle: oracle, deploymentBlock: 1n };
const deposit = {
  kind: "depositShielded",
  pool,
  shieldedToken: shielded,
  backingToken: backing,
  amount: 100n,
  minReceived: 99n,
} as const;
const success = (result: unknown) => ({ status: "success", result });
const failure = () => ({ status: "failure", error: new Error("RPC down") });
const burned = () => ({ status: "failure", error: { cause: { data: { errorName: "ERC721NonexistentToken" } } } });
const canonicalBlockHash = `0x${"c".repeat(64)}`;
const canonicalStep = {
  address: pool,
  abi: splitRiskPoolAbi,
  functionName: "depositShieldedAsset",
  args: [shielded, 100n, 99n],
};
function rawRpc(overrides: Record<string, any> = {}) {
  let activeHash = txHash;
  let receiptReads = 0;
  return vi.fn(async ({ method, params }: any) => {
    const step = overrides.step ?? vi.mocked(writeContract).mock.calls.at(-1)?.[1] ?? canonicalStep;
    if (method === "eth_getTransactionReceipt" || method === "eth_getTransactionByHash") activeHash = params[0];
    const receipt = {
      transactionHash: activeHash,
      blockHash: canonicalBlockHash,
      blockNumber: "0xa",
      transactionIndex: "0x0",
      from: owner,
      to: step.address,
      status: "0x1",
      gasUsed: "0x100",
      cumulativeGasUsed: "0x100",
      effectiveGasPrice: "0x1",
      type: "0x2",
      contractAddress: null,
      logs:
        step.functionName === "depositShieldedAsset"
          ? [
              {
                address: shieldNft,
                blockHash: canonicalBlockHash,
                blockNumber: "0xa",
                transactionHash: activeHash,
                transactionIndex: "0x0",
                logIndex: "0x0",
                removed: false,
                data: "0x",
                topics: encodeEventTopics({
                  abi: erc721TransferEventAbi,
                  eventName: "Transfer",
                  args: { from: zeroAddress, to: owner, tokenId: 1n },
                }),
              },
            ]
          : [],
      ...overrides.receipt,
    };
    if (method === "eth_getTransactionReceipt")
      return { ...receipt, ...(receiptReads++ > 0 ? overrides.freshReceipt : {}) };
    if (method === "eth_getTransactionByHash")
      return {
        hash: activeHash,
        from: owner,
        to: step.address,
        input: encodeFunctionData({ abi: step.abi, functionName: step.functionName, args: step.args }),
        value: "0x0",
        blockHash: canonicalBlockHash,
        blockNumber: "0xa",
        transactionIndex: "0x0",
        chainId: "0x14a34",
        ...overrides.transaction,
      };
    if (method === "eth_getBlockByNumber")
      return params[0] === "latest"
        ? { number: "0xb", hash: `0x${"d".repeat(64)}`, transactions: [], ...overrides.head }
        : { number: "0xa", hash: canonicalBlockHash, transactions: [activeHash], ...overrides.block };
    throw new Error(`unexpected RPC method ${method}`);
  });
}
function clientFor(overrides: Record<string, any> = {}) {
  const values: Record<string, any> = {
    poolCount: 1n,
    getPools: [pool],
    getPoolInfo: info,
    allowance: 0n,
    shieldReceiptNFT: shieldNft,
    protectorReceiptNFT: protectorNft,
    poolConfig: [1n, 10000n, 1n, 10000n, 100000000000n, 60n, 100n, owner, 200n, oracle],
    paused: false,
    isPoolActive: true,
    totalProtectorTokens: 300n,
    totalProtectorShares: 300n * 10n ** 18n,
    poolState: [100n, 300n],
    totalShieldedTokens: 100n,
    requiresStrictProtectedBackingPrice: true,
    shieldedTokenTransferIntegrityBroken: false,
    protectionOpeningEligibilityRequired: true,
    isProtectionOpeningAllowed: true,
    canDepositShielded: true,
    canDepositProtector: true,
    totalShieldCollateralAmount: 100n,
    totalValueAtDeposit: 10000000000n,
    shieldedTokenDecimals: 0,
    backingTokenDecimals: 0,
    accessControl: zeroAddress,
    nextTokenId: 1n,
    ownerOf: owner,
    getUserNFTCounts: [0n, 1n],
    SHIELDED_TOKEN: shielded,
    BACKING_TOKEN: backing,
    COMMISSION_RATE: 2000n,
    POOL_FEE: 100n,
    getProtectorPositionAmount: 150n,
    tokenInfo: ["Test Stock", "tSTOCK", oracle, zeroAddress, zeroAddress, 15000n],
    isPriceStale: [false, 1000n],
    isBackupActiveForToken: false,
    getTokenDualFeedStatus: [false, oracle, zeroAddress, false, false, 0n],
    isTokenChallengeable: false,
    getPrice: 100000000n,
    getPriceWithStrictCircuitBreaker: 100000000n,
    getProtectorDepositInfo: [150n, 1n, 1100n, 100n, 50n, 0n],
    getPosition: {
      amount: 100n,
      depositTime: 1n,
      valueAtDeposit: 10000000000n,
      collateralAmount: 150n,
      lastFeeClaimTime: 1n,
    },
    getValue: 10000000000n,
    getPriceForFeeAccrual: 100000000n,
    getPriceForClosedSessionExit: 100000000n,
    feeValueBaselineUsd: 10000000000n,
    decimals: 0,
    balanceOf: (c: any) => (c.args[0] === owner ? 100n : 300n),
    getWhitelistedTokens: [shielded],
    ...overrides,
  };
  const value = (call: any) =>
    typeof values[call.functionName] === "function" ? values[call.functionName](call) : values[call.functionName];
  return {
    request: rawRpc(),
    getBlockNumber: vi.fn(async () => 10n),
    getChainId: vi.fn(async () => 84532),
    getBlock: vi.fn(async () => ({ number: 10n, hash: canonicalBlockHash, timestamp: 1000n })),
    readContract: vi.fn(async (call) => {
      const result = value(call);
      if (result?.status === "failure") throw result.error;
      return result?.status === "success" ? result.result : result;
    }),
    multicall: vi.fn(async ({ contracts }) =>
      contracts.map((call: any) => {
        const result = value(call);
        return result?.status ? result : success(result);
      }),
    ),
    simulateContract: vi.fn(async () => ({ request: {} })),
    getLogs: vi.fn(async () => []),
  } as any;
}

describe("transaction intent boundaries", () => {
  it("uses exact spending approval followed by a bounded deposit", async () => {
    const result = await planIntent(clientFor(), owner, { factory }, deposit);
    expect(result.steps.map((s) => s.functionName)).toEqual(["approve", "depositShieldedAsset"]);
    expect(result.steps[0]!.args).toEqual([pool, 100n]);
    expect(result.steps[1]!.args).toEqual([shielded, 100n, 99n]);
  });
  it("clears a smaller nonzero allowance before setting its exact replacement", async () => {
    const result = await planIntent(clientFor({ allowance: 50n }), owner, { factory }, deposit);
    expect(result.steps.map((s) => s.args)).toEqual([
      [pool, 0n],
      [pool, 100n],
      [shielded, 100n, 99n],
    ]);
  });
  it("does not request an approval when the current allowance is sufficient", async () => {
    const result = await planIntent(clientFor({ allowance: 100n }), owner, { factory }, deposit);
    expect(result.steps).toHaveLength(1);
  });
  it.each([0n, -1n])("rejects nonpositive deposits before an allowance read (%s)", async (amount) => {
    const client = clientFor();
    await expect(planIntent(client, owner, { factory }, { ...deposit, amount })).rejects.toThrow("positive");
    expect(client.readContract).not.toHaveBeenCalled();
  });
  it("rejects unbounded withdrawals", async () => {
    await expect(
      planIntent(
        clientFor(),
        owner,
        { factory },
        {
          kind: "activateShielded",
          pool,
          position: encodePositionId(pool, "shield", 0n),
          shieldedToken: shielded,
          backingToken: backing,
          minOut: 0n,
        },
      ),
    ).rejects.toThrow("minimum output");
  });
  it("rejects mismatched position sides and pool addresses", async () => {
    await expect(
      planIntent(
        clientFor(),
        owner,
        { factory },
        {
          kind: "withdrawShielded",
          pool,
          position: encodePositionId(pool, "protector", 0n),
          shieldedToken: shielded,
          minOut: 1n,
        },
      ),
    ).rejects.toThrow("Position type");
    await expect(
      planIntent(
        clientFor(),
        owner,
        { factory },
        {
          kind: "withdrawShielded",
          pool: other,
          position: encodePositionId(pool, "shield", 0n),
          shieldedToken: shielded,
          minOut: 1n,
        },
      ),
    ).rejects.toThrow("Position pool");
  });
  it("rejects assets inconsistent with factory metadata before approval", async () => {
    const client = clientFor();
    await expect(planIntent(client, owner, { factory }, { ...deposit, shieldedToken: other })).rejects.toThrow(
      "does not match",
    );
    expect(client.readContract.mock.calls.some(([c]: any) => c.functionName === "allowance")).toBe(false);
  });
  it("rejects unknown factory pools before approval", async () => {
    await expect(planIntent(clientFor({ getPoolInfo: failure() }), owner, { factory }, deposit)).rejects.toThrow(
      "RPC down",
    );
  });
});

describe("wallet session and receipt safety", () => {
  let current: any;
  let connector: any;
  beforeEach(() => {
    vi.clearAllMocks();
    connector = { uid: "wallet-1", getAccounts: vi.fn(async () => [owner]), getChainId: vi.fn(async () => 84532) };
    current = { status: "connected", address: owner, chainId: 84532, connector };
    vi.mocked(getAccount).mockImplementation(() => current);
    vi.mocked(writeContract).mockResolvedValue(txHash as any);
    vi.mocked(waitForTransactionReceipt).mockResolvedValue({
      status: "success",
      transactionHash: txHash,
      logs: [],
    } as any);
  });
  const config = {} as any;
  const adapter = (client: any) => ({ chain: { id: 84532 }, addresses: { factory }, publicClient: client }) as any;
  it("forwards the creation factory through the wallet sender before any approval", async () => {
    const configured = adapter(clientFor());
    configured.addresses.creationFactory = other;
    await expect(sendEvmIntent(configured,config,owner,{kind:"createPool",params:{} as any})).rejects.toThrow("Pool creation factory is not part of the verified deployment");
    expect(writeContract).not.toHaveBeenCalled();
  });
  it("rejects a live wallet on a different chain", async () => {
    connector.getChainId.mockResolvedValue(8453);
    await expect(assertWalletSession(config, owner, 84532, connector.uid)).rejects.toThrow("Wrong network");
  });
  it("rejects an account switch even before framework state catches up", async () => {
    connector.getAccounts.mockResolvedValue([other]);
    await expect(assertWalletSession(config, owner, 84532, connector.uid)).rejects.toThrow("account changed");
  });
  it("stops after approval if the account changes while it confirms", async () => {
    vi.mocked(waitForTransactionReceipt).mockImplementation(async () => {
      current = { ...current, address: other };
      return { status: "success", transactionHash: txHash, logs: [] } as any;
    });
    await expect(sendEvmIntent(adapter(clientFor()), config, owner, deposit)).rejects.toThrow("account changed");
    expect(writeContract).toHaveBeenCalledTimes(1);
  });
  it("does not sign after a failed simulation", async () => {
    const client = clientFor();
    client.simulateContract.mockRejectedValue(new Error("OraclePriceStale"));
    await expect(sendEvmIntent(adapter(client), config, owner, deposit)).rejects.toThrow("OraclePriceStale");
    expect(writeContract).not.toHaveBeenCalled();
  });
  it("rejects a read RPC configured for the wrong network", async () => {
    const client = clientFor();
    client.getChainId.mockResolvedValue(8453);
    await expect(sendEvmIntent(adapter(client), config, owner, deposit)).rejects.toThrow("Wrong network");
    expect(writeContract).not.toHaveBeenCalled();
  });
  it("does not treat a cancellation replacement as successful protocol execution", async () => {
    vi.mocked(waitForTransactionReceipt).mockImplementation(async (_config, args: any) => {
      args.onReplaced({ reason: "cancelled" });
      return { status: "success", transactionHash: txHash, logs: [] } as any;
    });
    await expect(sendEvmIntent(adapter(clientFor()), config, owner, deposit)).rejects.toThrow("cancelled or replaced");
    expect(writeContract).toHaveBeenCalledTimes(1);
  });
  it("does not accept an unrelated waiter hash without a replacement event", async () => {
    vi.mocked(waitForTransactionReceipt).mockResolvedValue({
      status: "success",
      transactionHash: `0x${"b".repeat(64)}`,
      logs: [],
    } as any);
    await expect(sendEvmIntent(adapter(clientFor({ allowance: 100n })), config, owner, deposit)).rejects.toThrow(
      "cancelled or replaced",
    );
  });
  it("ignores a zero waiter block hash and verifies fresh raw sealed evidence", async () => {
    vi.mocked(waitForTransactionReceipt).mockResolvedValue({
      status: "success",
      transactionHash: txHash,
      blockHash: zeroHash,
      logs: [],
    } as any);
    const result = await sendEvmIntent(adapter(clientFor({ allowance: 100n })), config, owner, deposit);
    expect(result.positionId).toBe(encodePositionId(pool, "shield", 1n));
  });
  it("returns the mined replacement hash when only the gas price was raised", async () => {
    const replacementHash = `0x${"b".repeat(64)}`;
    vi.mocked(waitForTransactionReceipt).mockImplementation(async (_config, args: any) => {
      args.onReplaced({
        reason: "repriced",
        replacedTransaction: { hash: txHash },
        transaction: { hash: replacementHash },
      });
      return { status: "success", transactionHash: replacementHash, logs: [] } as any;
    });
    const result = await sendEvmIntent(adapter(clientFor({ allowance: 100n })), config, owner, deposit);
    expect(result.txId).toBe(replacementHash);
  });
  it("reports every approval and deposit step with its hash before confirmation", async () => {
    const events: any[] = [];
    await sendEvmIntent(adapter(clientFor()), config, owner, deposit, { onStep: (step) => events.push(step) });
    expect(events).toEqual([
      { index: 1, total: 2, label: "Approve spending" },
      { index: 1, total: 2, label: "Approve spending", awaitingWallet: true },
      { index: 1, total: 2, label: "Approve spending", txId: txHash },
      { index: 2, total: 2, label: "Confirm deposit" },
      { index: 2, total: 2, label: "Confirm deposit", awaitingWallet: true },
      { index: 2, total: 2, label: "Confirm deposit", txId: txHash },
    ]);
  });
  it("updates the recoverable transaction hash after a valid repricing", async () => {
    const replacementHash = `0x${"b".repeat(64)}`;
    vi.mocked(waitForTransactionReceipt).mockImplementation(async (_config, args: any) => {
      args.onReplaced({
        reason: "repriced",
        replacedTransaction: { hash: txHash },
        transaction: { hash: replacementHash },
      });
      return { status: "success", transactionHash: replacementHash, logs: [] } as any;
    });
    const events: any[] = [];
    await sendEvmIntent(adapter(clientFor({ allowance: 100n })), config, owner, deposit, {
      onStep: (step) => events.push(step),
    });
    expect(events.map((step) => step.txId)).toEqual([undefined, undefined, txHash, replacementHash]);
  });
  it("keeps the submitted hash available if receipt verification later fails", async () => {
    const events: any[] = [];
    const client = clientFor({ allowance: 100n });
    client.request = rawRpc({ receipt: { blockHash: zeroHash } });
    await expect(
      sendEvmIntent(adapter(client), config, owner, deposit, { onStep: (step) => events.push(step) }),
    ).rejects.toThrow("sealed confirmation");
    expect(events.at(-1).txId).toBe(txHash);
  });
});

describe("truthful pool and position reads", () => {
  it("fails visibly when paused/config/decimal reads are unavailable", async () => {
    for (const field of ["paused", "poolConfig", "shieldedTokenDecimals", "totalProtectorTokens"])
      await expect(createReader(clientFor({ [field]: failure() }), deps).loadPools()).rejects.toThrow(
        "data unavailable",
      );
  });
  it("counts extant receipts instead of the lifetime mint counter", async () => {
    const pools = await createReader(
      clientFor({ nextTokenId: 3n, ownerOf: (c: any) => (c.args[0] === 1n ? burned() : owner) }),
      deps,
    ).loadPools();
    expect(pools[0]!.stats.protectorPositionCount).toBe(2n);
  });
  it("does not treat a failed NFT owner read as a burned receipt", async () => {
    await expect(createReader(clientFor({ ownerOf: failure() }), deps).loadPools()).rejects.toThrow(
      "discovery data unavailable",
    );
  });
  it("shows unavailable safety probes and protected prices as paused", async () => {
    for (const field of [
      "isPriceStale",
      "isBackupActiveForToken",
      "getTokenDualFeedStatus",
      "isTokenChallengeable",
      "getPrice",
    ]) {
      const pools = await createReader(clientFor({ [field]: failure() }), deps).loadPools();
      expect(pools[0]!.oracle.status).toBe("paused");
    }
  });
  it("shows challengeable prices as paused before a challenge is submitted", async () => {
    const pools = await createReader(clientFor({ isTokenChallengeable: true }), deps).loadPools();
    expect(pools[0]!.oracle.status).toBe("paused");
  });
  it("retains retired pools and disables their active flag", async () => {
    const pools = await createReader(clientFor({ isPoolActive: false }), deps).loadPools();
    expect(pools[0]!.stats.active).toBe(false);
  });
  it("pins pool multicalls to the same block", async () => {
    const client = clientFor();
    await createReader(client, deps).loadPools();
    expect(client.multicall.mock.calls.every(([c]: any) => c.blockNumber === 10n)).toBe(true);
  });
  it("uses the stored notice-completion timestamp without adding the duration twice", async () => {
    const positions = await createReader(clientFor(), deps).getOwnerPositions(owner);
    expect(positions.protector[0]!.availableAt).toBe(1100n);
    expect(positions.protector[0]!.noticeSecondsRemaining).toBe(100n);
  });
  it("allows expired notice windows to be restarted", async () => {
    const client = clientFor();
    vi.mocked(Date.now).mockReturnValue(Number(1100n + 604801n) * 1000);
    client.getBlock.mockResolvedValue({ number: 10n, hash: canonicalBlockHash, timestamp: 1100n + 604801n });
    const positions = await createReader(client, deps).getOwnerPositions(owner);
    expect(positions.protector[0]!.isUnlocking).toBe(false);
  });
  it("fails visibly rather than truncating positions beyond the discovery cap", async () => {
    await expect(createReader(clientFor({ nextTokenId: 2001n }), deps).getOwnerPositions(owner)).rejects.toThrow(
      "discovery limit",
    );
  });
  it("checks discovered positions against the authoritative owner NFT balance", async () => {
    await expect(
      createReader(clientFor({ getUserNFTCounts: [0n, 2n] }), deps).getOwnerPositions(owner),
    ).rejects.toThrow("incomplete");
  });
  it("fails on unavailable token decimals and balances rather than returning invented defaults", async () => {
    await expect(createReader(clientFor({ decimals: failure() }), deps).listWhitelistedTokens()).rejects.toThrow(
      "data unavailable",
    );
    await expect(createReader(clientFor({ balanceOf: failure() }), deps).getBalances(owner)).rejects.toThrow(
      "data unavailable",
    );
  });
});

describe("withdrawal fee quotes", () => {
  it("deducts fees from gains using integer token units", () => {
    expect(netShieldAmount(100000000n, 10000000000n, 10000000000n, 200000000n, 6, [2000n, 1000n, 500n])).toBe(
      82500000n,
    );
  });
  it("preserves the fee high-water mark", () => {
    expect(netShieldAmount(100000000n, 10000000000n, 18000000000n, 200000000n, 6, [2000n, 1000n, 500n])).toBe(
      96500000n,
    );
  });
  it("does not charge gains again after a drawdown", () => {
    expect(netShieldAmount(100n, 10000000000n, 20000000000n, 150000000n, 0, [2000n])).toBe(100n);
  });
  it("matches fee ceil rounding for dust and caps at the position amount", () => {
    expect(netShieldAmount(1n, 100000000n, 0n, 100000001n, 0, [1n, 1n, 1n])).toBe(0n);
  });
  it("retains the receipt when fee pricing is unavailable without claiming a zero-value quote", async () => {
    const positions = await createReader(
      clientFor({
        getUserNFTCounts: [1n, 0n],
        getPriceForFeeAccrual: failure(),
        getPriceForClosedSessionExit: failure(),
      }),
      deps,
    ).getOwnerPositions(owner);
    expect(positions.shield).toHaveLength(1);
    expect(positions.shield[0]).toMatchObject({
      deposited: 100n,
      sameAssetQuoteAvailable: false,
      sameAssetExit: { state: "unknown" },
    });
  });
});

it("preserves a clear message for an interrupted wallet session", () => {
  expect(friendlyError(new Error("Wallet account changed"))).toContain("account changed");
});

describe("bounded and accurate activity reads", () => {
  const log = (eventName: string, args: any, logIndex: number, hash = txHash) => ({
    eventName,
    args,
    address: pool,
    blockNumber: 10n,
    logIndex,
    transactionHash: hash,
  });
  it("includes partial withdrawals and uses the actual output asset", async () => {
    const client = clientFor();
    client.getLogs.mockResolvedValue([
      log("PartialWithdrawal", { user: owner, withdrawAmount: 12n }, 1),
      log("ShieldedWithdrawal", { withdrawer: owner, amount: 15n, preferredAsset: shielded }, 2),
    ]);
    const activity = await createReader(client, deps).getActivity(owner);
    expect(activity.map((a) => [a.kind, a.rawAmount, a.token])).toEqual([
      ["withdraw", 15n, shielded],
      ["withdraw", 12n, shielded],
    ]);
  });
  it("does not double-count a protected exit as another withdrawal", async () => {
    const client = clientFor();
    client.getLogs.mockResolvedValue([
      log("ShieldActivated", { withdrawer: owner, amount: 100n, backingTokenAmount: 100n }, 1),
      log("ShieldedWithdrawal", { withdrawer: owner, amount: 100n, preferredAsset: backing }, 2),
      log("ShieldedWithdrawal", { withdrawer: other, amount: 200n, preferredAsset: backing }, 3),
    ]);
    const activity = await createReader(client, deps).getActivity(owner);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ kind: "activate", rawAmount: 100n, token: backing });
  });
  it("uses deployment-bounded RPC log windows", async () => {
    const client = clientFor();
    client.getBlockNumber.mockResolvedValue(5000n);
    await createReader(client, { ...deps, deploymentBlock: 1000n }).getActivity(owner);
    expect(client.getLogs.mock.calls.map(([call]: any) => [call.fromBlock, call.toBlock])).toEqual([
      [3001n, 5000n],
      [1001n, 3000n],
      [1000n, 1000n],
    ]);
  });
  it("fails visibly when log history cannot be read", async () => {
    const client = clientFor();
    client.getLogs.mockRejectedValue(new Error("RPC down"));
    await expect(createReader(client, deps).getActivity(owner)).rejects.toThrow("RPC down");
  });
  it("does not scan Base from genesis without deployment metadata", async () => {
    const client = clientFor();
    await expect(createReader(client, { factory, compositeOracle: oracle }).getActivity(owner)).rejects.toThrow(
      "deployment block",
    );
    expect(client.getLogs).not.toHaveBeenCalled();
  });
});

it("reads oracle safety from each pool's configured oracle", async () => {
  const client = clientFor({ poolConfig: [1n, 10000n, 1n, 10000n, 100000000000n, 60n, 100n, owner, 200n, other] });
  await createReader(client, deps).loadPools();
  const calls = client.multicall.mock.calls.flatMap(([args]: any) => args.contracts);
  expect(
    calls.filter((call: any) => call.functionName === "getPrice").every((call: any) => call.address === other),
  ).toBe(true);
});

describe("protected exit quote safety", () => {
  it("uses the verified backing price instead of assuming a dollar peg", async () => {
    const quote = await createReader(clientFor({ getPriceWithStrictCircuitBreaker: 200000000n }), deps)
      .getProtectedExitQuote!(encodePositionId(pool, "shield", 0n));
    expect(quote).toEqual({ amount: 50n, token: backing, blockNumber: 10n, quotedAt: 1000n });
  });
  it("caps backing-token payout to the position collateral after a depeg", async () => {
    const quote = await createReader(clientFor({ getPriceWithStrictCircuitBreaker: 50000000n }), deps)
      .getProtectedExitQuote!(encodePositionId(pool, "shield", 0n));
    expect(quote.amount).toBe(150n);
  });
  it("fails closed when strict pricing or pool availability fails", async () => {
    await expect(
      createReader(clientFor({ getPriceWithStrictCircuitBreaker: failure() }), deps).getProtectedExitQuote!(
        encodePositionId(pool, "shield", 0n),
      ),
    ).rejects.toThrow("RPC down");
    await expect(
      createReader(clientFor({ paused: true }), deps).getProtectedExitQuote!(encodePositionId(pool, "shield", 0n)),
    ).rejects.toThrow("paused");
  });
  it("returns the actual claimable commission rather than projected earnings", async () => {
    const positions = await createReader(
      clientFor({ getProtectorDepositInfo: [150n, 1n, 1100n, 100n, 50n, 7n] }),
      deps,
    ).getOwnerPositions(owner);
    expect(positions.protector[0]!.claimableCommission).toBe(7n);
  });
});

describe("canonical wallet transaction evidence", () => {
  const verify = (overrides: Record<string, any> = {}) => {
    const client = clientFor();
    client.request = rawRpc({ step: canonicalStep, ...overrides });
    return readCanonicalStepReceipt(client, txHash as any, owner, canonicalStep as any, 84532);
  };
  it("uses raw sealed evidence and returns only the canonical receipt logs", async () => {
    const receipt = await verify();
    expect(receipt.blockHash).toBe(canonicalBlockHash);
    expect(receipt.blockNumber).toBe(10n);
    expect(receipt.logs).toHaveLength(1);
  });
  it.each([null, zeroHash, "0x1234"])("rejects unsealed raw receipt hashes (%s)", async (blockHash) => {
    await expect(verify({ receipt: { blockHash } })).rejects.toThrow("sealed confirmation");
  });
  it("rejects a receipt moved or reorged during confirmation", async () => {
    await expect(verify({ freshReceipt: { blockHash: `0x${"e".repeat(64)}` } })).rejects.toThrow();
    await expect(verify({ block: { transactions: [`0x${"f".repeat(64)}`] } })).rejects.toThrow("canonical block");
  });
  it.each([{ from: other }, { to: other }, { input: "0x1234" }, { value: "0x1" }, { chainId: "0x2105" }])(
    "rejects changed mined action %s",
    async (transaction) => {
      await expect(verify({ transaction })).rejects.toThrow("reviewed action");
    },
  );
  it("requires two sealed block confirmations", async () => {
    await expect(verify({ head: { number: "0xa" } })).rejects.toThrow("two sealed confirmations");
  });
  it("rejects fabricated event provenance", async () => {
    await expect(
      verify({ receipt: { logs: [{ transactionHash: txHash, blockHash: zeroHash, removed: false }] } }),
    ).rejects.toThrow("logs");
  });
  it("does not confirm a position without the matching receipt NFT mint", async () => {
    const plan = await planIntent(clientFor({ allowance: 100n }), owner, { factory }, deposit);
    expect(() => plan.extract!({ logs: [] } as any)).toThrow("expected protection position");
  });
});

describe("exact native deposit capacity", () => {
  const base = {
    shieldedPrice: 100n,
    backingPrice: 100n,
    shieldedDecimals: 0,
    backingDecimals: 0,
    totalProtectorTokens: 10n,
    totalShieldCollateralAmount: 0n,
    totalValueAtDeposit: 0n,
    trackedTvlUsd: 0n,
    maxTvlUsd: 100000n,
    collateralRatioBps: 15000n,
    minDeposit: 1n,
    maxDeposit: 1000n,
  };
  it("enforces aggregate USD collateral independently of the native collateral reservation", () => {
    expect(maximumDeposit({ ...base, totalValueAtDeposit: 400n }, "shield")).toBe(2n);
    expect(maximumDeposit({ ...base, totalShieldCollateralAmount: 9n }, "shield")).toBe(1n);
  });
  it("counts all tracked balances toward TVL and treats zero limits as closed", () => {
    expect(maximumDeposit({ ...base, trackedTvlUsd: 400n, maxTvlUsd: 500n }, "shield")).toBe(1n);
    expect(maximumDeposit({ ...base, maxTvlUsd: 0n }, "shield")).toBe(0n);
    expect(maximumDeposit({ ...base, maxDeposit: 0n }, "backing")).toBe(0n);
    expect(maximumDeposit({ ...base, minDeposit: 7n }, "shield")).toBe(0n);
  });
  it("caps native deposits at uint128 even when pool limits are larger", () => {
    expect(maximumDeposit({ ...base, maxTvlUsd: 10n ** 60n, maxDeposit: 10n ** 60n }, "backing")).toBe(
      (1n << 128n) - 1n,
    );
  });
  it("enforces positive minted shares and the aggregate protector reward share bound", () => {
    expect(
      maximumDeposit({ ...base, totalProtectorTokens: 1n, totalProtectorShares: 10n ** 38n - 1n }, "backing"),
    ).toBe(0n);
    expect(
      maximumDeposit(
        {
          ...base,
          backingDecimals: 36,
          backingPrice: 10n ** 36n,
          totalProtectorTokens: 0n,
          totalProtectorShares: 100n,
          maxDeposit: 10n ** 17n,
          maxTvlUsd: 10n ** 40n,
        },
        "backing",
      ),
    ).toBe(0n);
    expect(maximumDeposit({ ...base, totalProtectorTokens: 0n, totalProtectorShares: 10n ** 38n }, "backing")).toBe(
      1000n,
    );
  });
  it("matches an exhaustive small-unit reference across decimals, depegs, TVL and both collateral bounds", () => {
    for (let i = 0n; i < 240n; i++) {
      const input = {
        ...base,
        shieldedPrice: 11n + (i % 13n),
        backingPrice: 5n + (i % 7n),
        shieldedDecimals: Number(i % 2n),
        backingDecimals: Number((i / 2n) % 2n),
        totalProtectorTokens: 3n + (i % 20n),
        totalShieldCollateralAmount: i % 9n,
        totalValueAtDeposit: i % 17n,
        trackedTvlUsd: i % 11n,
        maxTvlUsd: 10n + (i % 29n),
        minDeposit: 1n + (i % 4n),
        maxDeposit: 30n,
        collateralRatioBps: 10001n + (i % 8000n),
      };
      let expected = 0n;
      for (let amount = input.minDeposit; amount <= input.maxDeposit; amount++) {
        const value = (amount * input.shieldedPrice) / 10n ** BigInt(input.shieldedDecimals);
        const cap =
          (((value * input.collateralRatioBps + 9999n) / 10000n) * 10n ** BigInt(input.backingDecimals)) /
          input.backingPrice;
        const aggregate = ((input.totalValueAtDeposit + value) * input.collateralRatioBps + 9999n) / 10000n;
        if (
          value > 0n &&
          cap > 0n &&
          input.trackedTvlUsd + value <= input.maxTvlUsd &&
          aggregate <= (input.totalProtectorTokens * input.backingPrice) / 10n ** BigInt(input.backingDecimals) &&
          input.totalShieldCollateralAmount + cap <= input.totalProtectorTokens
        )
          expected = amount;
      }
      expect(maximumDeposit(input, "shield")).toBe(expected);
    }
  });
});

describe("pool and wallet deposit eligibility", () => {
  it("keeps a second asset's opening availability when only the first asset loses its price", async () => {
    const client = clientFor({
      poolCount: 2n,
      getPools: [pool, other],
      getPoolInfo: (call: any) => ({ ...info, shieldedToken: call.args[0] === pool ? shielded : shieldNft }),
      getPrice: (call: any) => (call.args[0] === shielded ? failure() : 100000000n),
    });
    const [unavailable, healthy] = await createReader(client, deps).loadPools();
    expect(unavailable.availability.openPosition.state).toBe("unknown");
    expect(healthy.availability.openPosition.state).toBe("available");
  });

  it("separates stock opening policy from otherwise eligible collateral deposits", async () => {
    const client = clientFor({ isProtectionOpeningAllowed: false });
    const [market] = await createReader(client, deps).loadPools();
    expect(market.availability.openPosition.state).toBe("blocked");
    expect(market.availability.provideCollateral.state).toBe("available");
    expect(market.availability.maxShieldedDeposit).toBe(100n);
    expect(market.availability.trackedTvlUsd).toBe(40000000000n);
    expect(market.stats.capacityBps).toBe(4000n);
    await expect(planIntent(client, owner, { factory }, deposit)).rejects.toThrow("opening policy");
    const backingPlan = await planIntent(
      client,
      owner,
      { factory },
      { kind: "depositBacking", pool, backingToken: backing, amount: 100n, minReceived: 100n },
    );
    expect(backingPlan.steps.at(-1).functionName).toBe("depositBackingAsset");
  });
  it("allows an empty pool's collateral deposit without an unavailable stock feed", async () => {
    const client = clientFor({
      poolState: [0n, 0n],
      totalShieldedTokens: 0n,
      totalValueAtDeposit: 0n,
      totalShieldCollateralAmount: 0n,
      totalProtectorTokens: 0n,
      totalProtectorShares: 0n,
      getPrice: (call: any) => (call.args[0] === shielded ? failure() : 100000000n),
      isTokenChallengeable: (call: any) => call.args[0] === shielded,
    });
    const [market] = await createReader(client, deps).loadPools();
    expect(market.availability.openPosition.state).toBe("unknown");
    expect(market.availability.provideCollateral.state).toBe("available");
    await expect(
      planIntent(
        client,
        owner,
        { factory },
        { kind: "depositBacking", pool, backingToken: backing, amount: 100n, minReceived: 100n },
      ),
    ).resolves.toBeDefined();
  });
  it.each([
    ["paused", true, "not accepting"],
    ["isPoolActive", false, "not accepting"],
    ["shieldedTokenTransferIntegrityBroken", true, "transfer checks"],
    ["isTokenChallengeable", true, "under verification"],
    ["totalProtectorTokens", 1n, "capacity"],
    ["getPriceWithStrictCircuitBreaker", failure(), "RPC down"],
    ["getPriceForFeeAccrual", 0n, "fee pricing"],
  ])("rejects unavailable %s before an approval is planned", async (field, value, reason) => {
    const client = clientFor({ [field as string]: value });
    await expect(planIntent(client, owner, { factory }, deposit)).rejects.toThrow(reason as string);
    expect(client.readContract.mock.calls.some(([call]: any) => call.functionName === "allowance")).toBe(false);
  });
  it("checks the connected wallet's allowlist and balance before approval", async () => {
    await expect(
      planIntent(clientFor({ accessControl: other, canDepositShielded: false }), owner, { factory }, deposit),
    ).rejects.toThrow("wallet is not allowed");
    await expect(planIntent(clientFor({ balanceOf: 0n }), owner, { factory }, deposit)).rejects.toThrow("balance");
    await expect(
      planIntent(clientFor({ balanceOf: (c: any) => (c.args[0] === owner ? 100n : 0n) }), owner, { factory }, deposit),
    ).rejects.toThrow("accounting");
  });
  it("does not classify an allowlisted pool as publicly available", async () => {
    const [market] = await createReader(clientFor({ accessControl: other }), deps).loadPools();
    expect(market.availability.openPosition).toMatchObject({
      state: "unknown",
      blockers: [{ code: "account-restriction" }],
    });
  });
  it("rejects dust amounts even when a larger deposit would fit", async () => {
    await expect(
      planIntent(
        clientFor({ shieldedTokenDecimals: 18 }),
        owner,
        { factory },
        { ...deposit, amount: 1n, minReceived: 1n },
      ),
    ).rejects.toThrow("capacity");
  });
  it("pins every deposit check and rejects stale or reorganized snapshots", async () => {
    const client = clientFor();
    const plan = await planIntent(client, owner, { factory }, deposit);
    client.readContract.mockClear();
    await plan.beforeStep!();
    expect(client.readContract.mock.calls.every(([call]: any) => call.blockNumber === 10n)).toBe(true);
    client.getBlock.mockResolvedValue({ number: 10n, hash: canonicalBlockHash, timestamp: 800n });
    await expect(plan.beforeStep!()).rejects.toThrow("out of date");
    client.getBlock.mockImplementation(async ({ blockNumber }: any) => ({
      number: 10n,
      hash: blockNumber ? txHash : canonicalBlockHash,
      timestamp: 1000n,
    }));
    await expect(plan.beforeStep!()).rejects.toThrow("state changed");
  });
  it("refreshes opening eligibility before the next approval or deposit signature", async () => {
    let allowed = true;
    const plan = await planIntent(
      clientFor({ isProtectionOpeningAllowed: () => allowed }),
      owner,
      { factory },
      deposit,
    );
    allowed = false;
    await expect(plan.beforeStep!()).rejects.toThrow("opening policy");
  });
});

describe("independent position exit preflight", () => {
  it("exposes the position check lifetime and rejects stale or unsealed protected quote evidence", async () => {
    const client = clientFor({ getUserNFTCounts: [1n, 0n] });
    const { shield } = await createReader(client, deps).getOwnerPositions(owner);
    expect(shield[0]).toMatchObject({ evaluatedAt: 1000n, validUntil: 1020n });
    client.getBlock.mockResolvedValue({ number: 10n, hash: canonicalBlockHash, timestamp: 800n });
    await expect(createReader(client, deps).getProtectedExitQuote!(shield[0].id)).rejects.toThrow("out of date");
    client.getBlock.mockResolvedValue({ number: 10n, hash: zeroHash, timestamp: 1000n });
    await expect(createReader(client, deps).getProtectedExitQuote!(shield[0].id)).rejects.toThrow("out of date");
    client.getBlock.mockImplementation(async ({ blockNumber }: any) => ({
      number: 10n,
      hash: blockNumber ? txHash : canonicalBlockHash,
      timestamp: 1000n,
    }));
    await expect(createReader(client, deps).getProtectedExitQuote!(shield[0].id)).rejects.toThrow("state changed");
  });
  it("preserves the contract's same-asset recovery route after transfer integrity fails", async () => {
    const client = clientFor({
      getUserNFTCounts: [1n, 0n],
      shieldedTokenTransferIntegrityBroken: true,
      getPriceForFeeAccrual: failure(),
      getPriceForClosedSessionExit: failure(),
    });
    client.simulateContract.mockImplementation(async (call: any) => {
      if (call.args[1] === backing) throw { data: { errorName: "IncompatibleShieldedTokenForCrossAssetWithdrawal" } };
      return { request: {} };
    });
    const { shield } = await createReader(client, deps).getOwnerPositions(owner);
    expect(shield[0]).toMatchObject({
      sameAssetQuoteAvailable: true,
      withdrawableNet: 100n,
      sameAssetExit: { state: "available" },
      protectedExit: { state: "blocked" },
    });
  });

  it("retains all receipts when one exit quote fails and distinguishes failed simulation from missing data", async () => {
    const client = clientFor({
      getUserNFTCounts: [1n, 1n],
      getPriceForFeeAccrual: failure(),
      getPriceForClosedSessionExit: failure(),
    });
    client.simulateContract.mockRejectedValue({ cause: { data: { errorName: "OraclePendingChallenge" } } });
    const positions = await createReader(client, deps).getOwnerPositions(owner);
    expect(positions.shield).toHaveLength(1);
    expect(positions.protector).toHaveLength(1);
    expect(positions.shield[0]).toMatchObject({
      sameAssetQuoteAvailable: false,
      sameAssetExit: { state: "unknown" },
      protectedExit: { state: "blocked" },
    });
    expect(positions.shield[0].protectedExitQuote).toBeUndefined();
  });
  it.each([failure(), 0n])(
    "allows the verified last-close same-asset route when normal fee pricing fails",
    async (normalFee) => {
      const client = clientFor({
        getUserNFTCounts: [1n, 0n],
        isProtectionOpeningAllowed: false,
        getPriceForFeeAccrual: normalFee,
      });
      const { shield } = await createReader(client, deps).getOwnerPositions(owner);
      expect(shield[0]).toMatchObject({
        sameAssetQuoteAvailable: true,
        withdrawableNet: 100n,
        sameAssetExit: { state: "available" },
        protectedExit: { state: "available" },
      });
      expect(
        client.simulateContract.mock.calls.some(([call]: any) => call.args[1] === shielded && call.account === owner),
      ).toBe(true);
      expect(
        client.readContract.mock.calls.some(([call]: any) => call.functionName === "isProtectionOpeningAllowed"),
      ).toBe(false);
    },
  );
  it("does not offer a positive mathematical protected quote when execution fails", async () => {
    const client = clientFor();
    client.simulateContract.mockRejectedValue(new Error("pending price challenge"));
    await expect(
      createReader(client, deps).getProtectedExitQuote!(encodePositionId(pool, "shield", 0n)),
    ).rejects.toThrow("price challenge");
  });
  it("enforces the actual protected-exit delay before simulation", async () => {
    const client = clientFor({
      getPosition: { amount: 100n, depositTime: 990n, valueAtDeposit: 10000000000n, collateralAmount: 150n },
    });
    await expect(
      createReader(client, deps).getProtectedExitQuote!(encodePositionId(pool, "shield", 0n)),
    ).rejects.toThrow("delay");
    expect(client.simulateContract).not.toHaveBeenCalled();
  });
  it("simulates for the receipt owner and follows the pool's backing-price mode without an opening gate", async () => {
    const client = clientFor({
      ownerOf: other,
      requiresStrictProtectedBackingPrice: false,
      getPriceWithStrictCircuitBreaker: failure(),
      isProtectionOpeningAllowed: false,
    });
    const quote = await createReader(client, deps).getProtectedExitQuote!(encodePositionId(pool, "shield", 0n));
    expect(quote.amount).toBe(100n);
    expect(client.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ account: other, blockNumber: 10n, args: [0n, backing, 100n] }),
    );
    expect(
      client.readContract.mock.calls.some(([call]: any) => call.functionName === "isProtectionOpeningAllowed"),
    ).toBe(false);
  });
  it("does not award the previous owner execution eligibility after a receipt transfers", async () => {
    const client = clientFor({ getUserNFTCounts: [1n, 0n] });
    client.simulateContract.mockImplementation(async (call: any) => {
      if (call.args[1] === backing && call.account === owner) throw { data: { errorName: "NotReceiptOwner" } };
      return { request: {} };
    });
    const { shield } = await createReader(client, deps).getOwnerPositions(owner);
    expect(shield[0].sameAssetExit.state).toBe("available");
    expect(shield[0].protectedExit.state).toBe("blocked");
    expect(shield[0].protectedExitQuote).toBeUndefined();
  });
});

describe("test-token transaction preflight", () => {
  const faucetClient = (overrides: Record<string, any> = {}) =>
    Object.assign(
      clientFor({
        getAllTokens: [shielded],
        enabledTokens: true,
        dripAmount: 10n,
        canDrip: [true, 0n],
        ...overrides,
      }),
      { getCode: vi.fn(async () => "0x6000"), getBalance: vi.fn(async () => 1000000000000000n) },
    );
  it("allows the configured faucet independently of a missing protocol factory", async () => {
    const plan = await planIntent(
      faucetClient(),
      owner,
      { factory: zeroAddress, faucet: other },
      { kind: "faucetDrip" },
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ address: other, functionName: "dripAll", args: [owner] });
  });
  it.each([{ getAllTokens: [] }, { canDrip: [false, 1200n] }, { enabledTokens: false }, { dripAmount: 1000n }])(
    "rejects a successful-but-empty dispense before prompting",
    async (overrides) => {
      await expect(
        planIntent(faucetClient(overrides), owner, { factory, faucet: other }, { kind: "faucetDrip" }),
      ).rejects.toThrow("No test tokens");
    },
  );
  it("requires native test ETH for the wallet transaction", async () => {
    const client = faucetClient();
    client.getBalance.mockResolvedValue(0n);
    await expect(planIntent(client, owner, { factory, faucet: other }, { kind: "faucetDrip" })).rejects.toThrow(
      "test ETH",
    );
  });
  it("requires a positive dispense event for the exact faucet and recipient", async () => {
    const plan = await planIntent(faucetClient(), owner, { factory, faucet: other }, { kind: "faucetDrip" });
    const log = {
      address: other,
      data: encodeAbiParameters([{ type: "uint256" }], [10n]),
      topics: encodeEventTopics({
        abi: tokenFaucetAbi,
        eventName: "TokensDripped",
        args: { token: shielded, recipient: owner },
      }),
    };
    expect(plan.extract!({ logs: [log] } as any)).toEqual({});
    for (const logs of [
      [],
      [{ ...log, address: pool }],
      [{ ...log, data: encodeAbiParameters([{ type: "uint256" }], [0n]) }],
      [
        {
          ...log,
          topics: encodeEventTopics({
            abi: tokenFaucetAbi,
            eventName: "TokensDripped",
            args: { token: shielded, recipient: other },
          }),
        },
      ],
    ])
      expect(() => plan.extract!({ logs } as any)).toThrow("sent no test tokens");
  });
});

describe("sealed and current reader snapshots", () => {
  const paths = [
    ["pools", {}, (reader: any) => reader.loadPools()],
    ["empty pools", { poolCount: 0n }, (reader: any) => reader.loadPools()],
    ["positions", {}, (reader: any) => reader.getOwnerPositions(owner)],
    ["positions with no pools", { poolCount: 0n }, (reader: any) => reader.getOwnerPositions(owner)],
    ["positions with no receipts", { getUserNFTCounts: [0n, 0n] }, (reader: any) => reader.getOwnerPositions(owner)],
  ] as const;
  it.each(paths)(
    "rejects malformed, unsealed, future, and expired blocks before reading %s",
    async (_name, overrides, load) => {
      for (const bad of [
        { number: null },
        { number: 0n },
        { number: -1n },
        { number: "10" },
        { hash: null },
        { hash: zeroHash },
        { hash: "0x1234" },
        { hash: `0x${"g".repeat(64)}` },
        { timestamp: null },
        { timestamp: 0n },
        { timestamp: "1000" },
        { timestamp: 1001n },
        { timestamp: 980n },
      ]) {
        const client = clientFor(overrides);
        client.getBlock.mockResolvedValue({ number: 10n, hash: canonicalBlockHash, timestamp: 1000n, ...bad });
        await expect(load(createReader(client, deps))).rejects.toThrow("out of date or unconfirmed");
        expect(client.readContract).not.toHaveBeenCalled();
        expect(client.multicall).not.toHaveBeenCalled();
      }
    },
  );
  it.each(paths)("rechecks canonical block identity before returning %s", async (_name, overrides, load) => {
    for (const changed of [{ number: 11n }, { hash: txHash }, { timestamp: 999n }]) {
      const client = clientFor(overrides);
      client.getBlock.mockImplementation(async ({ blockNumber }: any) => ({
        number: 10n,
        hash: canonicalBlockHash,
        timestamp: 1000n,
        ...(blockNumber === undefined ? {} : changed),
      }));
      await expect(load(createReader(client, deps))).rejects.toThrow("state changed during verification");
      expect(client.getBlock).toHaveBeenLastCalledWith({ blockNumber: 10n });
    }
  });
  it.each(paths)(
    "does not turn an unavailable final canonical read into a %s result",
    async (_name, overrides, load) => {
      const client = clientFor(overrides);
      client.getBlock.mockImplementation(async ({ blockNumber }: any) => {
        if (blockNumber !== undefined) throw new Error("canonical RPC unavailable");
        return { number: 10n, hash: canonicalBlockHash, timestamp: 1000n };
      });
      await expect(load(createReader(client, deps))).rejects.toThrow("canonical RPC unavailable");
    },
  );
  it.each(paths)("rejects %s if its snapshot expires while the read is in flight", async (_name, overrides, load) => {
    const client = clientFor(overrides);
    client.getBlock.mockImplementation(async ({ blockNumber }: any) => {
      if (blockNumber !== undefined) vi.mocked(Date.now).mockReturnValue(1_020_000);
      return { number: 10n, hash: canonicalBlockHash, timestamp: 1000n };
    });
    await expect(load(createReader(client, deps))).rejects.toThrow("out of date or unconfirmed");
  });
  it.each(paths)("accepts a still-current %s snapshot and verifies its final block", async (_name, overrides, load) => {
    const client = clientFor(overrides);
    client.getBlock.mockResolvedValue({ number: 10n, hash: canonicalBlockHash, timestamp: 981n });
    await expect(load(createReader(client, deps))).resolves.toBeDefined();
    expect(client.getBlock).toHaveBeenLastCalledWith({ blockNumber: 10n });
  });
});
