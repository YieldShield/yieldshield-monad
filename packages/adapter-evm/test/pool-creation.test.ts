import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, zeroAddress, type PublicClient, type TransactionReceipt } from "viem";
import type { CreatePoolIntentParams, PoolCreationOptions } from "@yieldshield/core";
import * as creation from "../src/pool-creation";
import { CRYPTO_EXTENSION } from "../src/crypto-deployment";
import { planIntent } from "../src/intents";
import { splitRiskPoolFactoryAbi } from "../src/abis/splitRiskPoolFactory";
vi.mock("../src/crypto-deployment", async (original) => {
  const actual = await original<typeof import("../src/crypto-deployment")>();
  const { keccak256 } = await import("viem");
  const hash = keccak256("0x6000");
  return {
    ...actual,
    CRYPTO_EXTENSION: {
      ...actual.CRYPTO_EXTENSION!,
      factoryCodehash: hash,
      factoryImplementationCodehash: hash,
      poolImplementationCodehash: hash,
      compositeOracleCodehash: hash,
    },
  };
});

const owner = "0x1111111111111111111111111111111111111111";
const shielded = "0x2222222222222222222222222222222222222222";
const backing = "0x3333333333333333333333333333333333333333";
const pool = "0x4444444444444444444444444444444444444444";
const token = (address: string, symbol: string) => ({
  token: address,
  symbol,
  name: symbol,
  decimals: 6,
  minCollateralRatioBp: 12500n,
  tranche: "stable" as const,
});
const options: PoolCreationOptions = {
  chainId: 84532,
  factory: CRYPTO_EXTENSION!.factory,
  protectedAssets: [token(shielded, "tWETH")],
  backingAssets: [{ ...token(backing, "vUSDC"), minimumBondAmount: 500_000_000n }],
  minimumBondUsd: 50_000_000_000n,
  bounds: { ...creation.CREATION_BOUNDS },
  fixed: { ...creation.CREATION_FIXED },
  activePools: 9,
  maxActivePools: 100,
  evaluatedAt: 100,
  validUntil: 120,
};
const params: CreatePoolIntentParams = {
  ...options.fixed,
  shieldedToken: shielded,
  backingToken: backing,
  commissionRateBp: 700,
  poolFeeBp: 50,
  collateralRatioBp: 17500,
  creationBondAmount: 500_000_000n,
};
afterEach(() => vi.restoreAllMocks());
describe("dynamic pool authentication", () => {
  function client() {
    const d = CRYPTO_EXTENSION!;
    return {
      getChainId: vi.fn(async () => 84532),
      getCode: vi.fn(async () => "0x6000"),
      getStorageAt: vi.fn(
        async ({ address }: any) =>
          `0x${"0".repeat(24)}${(address === d.factory ? d.factoryImplementation : d.poolImplementation).slice(2)}`,
      ),
      readContract: vi.fn(async ({ functionName }: any) =>
        functionName === "splitRiskPoolImplementation"
          ? d.poolImplementation
          : functionName === "compositeOracle"
            ? d.compositeOracle
            : d.factory,
      ),
    };
  }
  it("authenticates a newly discovered pool without requiring a seeded address", async () => {
    await expect(creation.assertCreatedPools(client() as unknown as PublicClient, [pool], 1n)).resolves.toBeUndefined();
  });
  it("rejects a foreign chain, changed code or changed proxy implementation", async () => {
    const wrongChain = client();
    wrongChain.getChainId.mockResolvedValue(8453);
    await expect(creation.assertCreationFactory(wrongChain as unknown as PublicClient)).rejects.toThrow(/Sepolia/);
    const changedCode = client();
    changedCode.getCode.mockResolvedValue("0x6001");
    await expect(creation.assertCreationFactory(changedCode as unknown as PublicClient)).rejects.toThrow(/changed/);
    const changedSlot = client();
    changedSlot.getStorageAt.mockResolvedValue(`0x${"0".repeat(64)}`);
    await expect(creation.assertCreationFactory(changedSlot as unknown as PublicClient)).rejects.toThrow(/changed/);
  });
  it("rejects a pool claiming another factory even with matching proxy bytecode", async () => {
    const c = client();
    const read = c.readContract.getMockImplementation()!;
    c.readContract.mockImplementation(async (args) => (args.functionName === "POOL_FACTORY" ? owner : read(args)));
    await expect(creation.assertCreatedPools(c as unknown as PublicClient, [pool], 1n)).rejects.toThrow(
      /authenticated/,
    );
  });
});
describe("creator terms and bond", () => {
  it("uses native token decimals and rounds the bond upward", () => {
    expect(creation.minimumCreationBond(50_000_000_000n, 6, 100_000_000n)).toBe(500_000_000n);
    expect(creation.minimumCreationBond(50_000_000_000n, 6, 100_120_000n)).toBe(499_400_720n);
    expect(creation.minimumCreationBond(1n, 18, 3n)).toBe(333333333333333334n);
    expect(() => creation.minimumCreationBond(1n, 6, 0n)).toThrow();
  });
  it("accepts custom gain shares instead of assuming a twelve percent total", () => {
    expect(creation.validateCreationParams(params, options).backing.symbol).toBe("vUSDC");
  });
  it.each([
    { commissionRateBp: 99 },
    { commissionRateBp: 5001 },
    { commissionRateBp: 100.1 },
    { poolFeeBp: -1 },
    { poolFeeBp: 2001 },
    { collateralRatioBp: 12499 },
    { collateralRatioBp: 50001 },
    { creationBondAmount: 499_999_999n },
    { backingToken: shielded },
    { shieldedToken: zeroAddress },
  ])("rejects invalid creator parameters %#", (override) => {
    expect(() => creation.validateCreationParams({ ...params, ...override }, options)).toThrow();
  });
  it.each([
    "protocolFeeBp",
    "maxTvlUsd",
    "minimumPoolTime",
    "unlockDuration",
    "shieldTransferLock",
    "protectorTransferLock",
  ] as const)("never silently ignores protocol setting %s", (key) => {
    const value = params[key];
    expect(() =>
      creation.validateCreationParams(
        { ...params, [key]: typeof value === "bigint" ? value + 1n : value + 1 },
        options,
      ),
    ).toThrow(/protocol setting/);
  });
});
describe("creation transaction intent", () => {
  const client = () =>
    ({
      readContract: vi.fn(async ({ functionName }: any) => (functionName === "balanceOf" ? 1_000_000_000n : 0n)),
    }) as unknown as PublicClient;
  const deps = { factory: owner, creationFactory: CRYPTO_EXTENSION!.factory };
  it("routes the reviewed terms and exact bond to the verified creation factory", async () => {
    vi.spyOn(creation, "readPoolCreationOptions").mockResolvedValue(options);
    const plan = await planIntent(client(), owner, deps, { kind: "createPool", params });
    expect(plan.steps[0]!.args).toEqual([deps.creationFactory, 500_000_000n]);
    expect(plan.steps[1]!.address).toBe(deps.creationFactory);
    expect(plan.steps[1]!.args).toEqual([shielded, "tWETH", backing, "vUSDC", 700n, 50n, 17500n, 500_000_000n]);
    vi.mocked(creation.readPoolCreationOptions).mockResolvedValue({
      ...options,
      backingAssets: [{ ...options.backingAssets[0]!, minimumBondAmount: 600_000_000n }],
    });
    await expect(plan.beforeStep!()).rejects.toThrow(/bond/);
  });
  it("only returns a pool id for the exact reviewed event", async () => {
    vi.spyOn(creation, "readPoolCreationOptions").mockResolvedValue(options);
    const plan = await planIntent(client(), owner, deps, { kind: "createPool", params });
    const receipt = (fee = 50n, emitter = deps.creationFactory) =>
      ({
        logs: [
          {
            address: emitter,
            topics: encodeEventTopics({
              abi: splitRiskPoolFactoryAbi,
              eventName: "PoolCreated",
              args: { poolAddress: pool, shieldedToken: shielded, backingToken: backing },
            }),
            data: encodeAbiParameters(
              [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
              [700n, fee, 17500n, owner],
            ),
          },
        ],
      }) as TransactionReceipt;
    expect(plan.extract!(receipt())).toEqual({ poolId: pool });
    expect(() => plan.extract!(receipt(51n))).toThrow(/reviewed/);
    expect(() => plan.extract!(receipt(50n, owner))).toThrow(/reviewed/);
  });
  it("rejects an unregistered factory before approvals", async () => {
    await expect(
      planIntent(client(), owner, { ...deps, creationFactory: owner }, { kind: "createPool", params }),
    ).rejects.toThrow(/verified deployment/);
  });
});
