import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, keccak256, pad, parseAbi, type Address, type Hex } from "viem";
import {
  monFeedId,
  redstoneUpdateCalldata,
  refreshRedstonePrice,
  validateRedstoneUpdate,
  verifyRedstoneUpdateTargets,
  type RedstoneRecoveryConfig,
} from "./redstone-update";

const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const now = 1791740904000;
const bytecode = "0x60006000" as Hex;
const pin = { slot: pad("0x01"), address: address(3), runtimeCodehash: keccak256(bytecode) };
const config: RedstoneRecoveryConfig = {
  address: address(1),
  runtimeCodehash: keccak256(bytecode),
  adapter: address(2),
  adapterRuntimeCodehash: keccak256(bytecode),
  sourceImplementation: pin,
  adapterImplementation: pin,
  uniqueSignersCount: 2,
  authorizedSigners: [address(11), address(12), address(13), address(14), address(15)],
};
const update = () => ({
  chainId: 10143,
  provider: "redstone",
  adapter: config.adapter,
  source: config.address,
  feedId: monFeedId,
  publishedAt: now / 1000,
  price: "2600000",
  signers: [address(11), address(12)],
  payload: "0x12345678000002ed57011e0000",
  expiresAt: now + 25000,
  verifiedAtBlock: "70174964",
});
afterEach(() => vi.useRealTimers());

describe("signed MON update boundaries", () => {
  it("locally encodes only the MON update and preserves the signature trailer", () => {
    const valid = validateRedstoneUpdate(update(), config, now);
    const data = redstoneUpdateCalldata(valid);
    const decoded = decodeFunctionData({ abi: parseAbi(["function updateDataFeedsValuesPartial(bytes32[])"]), data });
    expect(decoded.functionName).toBe("updateDataFeedsValuesPartial");
    expect(decoded.args).toEqual([[monFeedId]]);
    expect(data.endsWith(valid.payload.slice(2))).toBe(true);
  });
  it("refuses foreign targets, malformed data, stale metadata and non-quorum signer claims", () => {
    for (const change of [
      { chainId: 143 },
      { provider: "other" },
      { adapter: address(9) },
      { source: address(9) },
      { feedId: pad("0x01") },
      { publishedAt: now / 1000 + 6 },
      { publishedAt: now / 1000 - 91 },
      { expiresAt: now },
      { expiresAt: now + 31000 },
      { price: "0" },
      { price: "1e8" },
      { verifiedAtBlock: "0" },
      { payload: "0x" },
      { payload: "0xabc" },
      { payload: "0xzz" },
      { payload: "0x123456" },
      { payload: `0x${"aa".repeat(32769)}` },
      { signers: [address(11), address(11)] },
      { signers: [address(11), address(99)] },
      { signers: [address(11)] },
    ])
      expect(() => validateRedstoneUpdate({ ...update(), ...change }, config, now)).toThrow("Invalid or expired");
  });
  it("checks both proxy and implementation identities before accepting a target", async () => {
    const reader = {
      getChainId: vi.fn(async () => 10143),
      getCode: vi.fn(async () => bytecode),
      getStorageAt: vi.fn(async () => pad(pin.address)),
    };
    await expect(verifyRedstoneUpdateTargets(reader, config)).resolves.toBeUndefined();
    expect(reader.getCode).toHaveBeenCalledWith({ address: config.adapter });
    expect(reader.getCode).toHaveBeenCalledWith({ address: config.address });
    reader.getStorageAt.mockResolvedValue(pad(address(99)));
    await expect(verifyRedstoneUpdateTargets(reader, config)).rejects.toThrow("verification failed");
    reader.getStorageAt.mockResolvedValue(pad(pin.address));
    reader.getCode.mockResolvedValue("0x6001");
    await expect(verifyRedstoneUpdateTargets(reader, config)).rejects.toThrow("verification failed");
    reader.getChainId.mockResolvedValue(143);
    await expect(verifyRedstoneUpdateTargets(reader, config)).rejects.toThrow("Monad testnet");
  });
});

describe("strict price checks around recovery", () => {
  const setup = () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    return {
      config,
      readStrictPrice: vi.fn<() => Promise<bigint>>().mockRejectedValueOnce(new Error("stale")),
      fetchUpdate: vi.fn(async () => update()),
      publish: vi.fn(async () => ({ status: "success" })),
    };
  };
  it("keeps a currently healthy strict reference without fetching or signing", async () => {
    const flow = setup();
    flow.readStrictPrice.mockReset().mockResolvedValue(2600000n);
    await refreshRedstonePrice(flow);
    expect(flow.fetchUpdate).not.toHaveBeenCalled();
    expect(flow.publish).not.toHaveBeenCalled();
  });
  it("does not open a wallet transaction when gateway access is missing", async () => {
    const flow = setup();
    flow.fetchUpdate.mockRejectedValue(new Error("RedStone gateway access is not configured."));
    await expect(refreshRedstonePrice(flow)).rejects.toThrow("access is not configured");
    expect(flow.publish).not.toHaveBeenCalled();
  });
  it("rejects an invalid API payload before the publishing callback", async () => {
    const flow = setup();
    flow.fetchUpdate.mockResolvedValue({ ...update(), adapter: address(99) });
    await expect(refreshRedstonePrice(flow)).rejects.toThrow("Invalid or expired");
    expect(flow.publish).not.toHaveBeenCalled();
  });
  it("requires the existing protected getter to succeed after an actual update", async () => {
    const flow = setup();
    flow.readStrictPrice.mockResolvedValueOnce(2600000n);
    await expect(refreshRedstonePrice(flow)).resolves.toEqual({ status: "success" });
    expect(flow.readStrictPrice).toHaveBeenCalledTimes(2);
    for (const result of [0n, new Error("still stale")]) {
      const bad = setup();
      if (result instanceof Error) bad.readStrictPrice.mockRejectedValueOnce(result);
      else bad.readStrictPrice.mockResolvedValueOnce(result);
      await expect(refreshRedstonePrice(bad)).rejects.toThrow();
    }
  });
  it("propagates a rejected chain simulation without calling the strict getter a second time", async () => {
    const flow = setup();
    flow.publish.mockRejectedValue(new Error("invalid oracle signatures"));
    await expect(refreshRedstonePrice(flow)).rejects.toThrow("invalid oracle signatures");
    expect(flow.readStrictPrice).toHaveBeenCalledTimes(1);
  });
});
