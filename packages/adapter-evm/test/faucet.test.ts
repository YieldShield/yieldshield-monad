import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { readFaucetStatus } from "../src/faucet";
const faucet = "0x0000000000000000000000000000000000000001" as Address,
  recipient = "0x0000000000000000000000000000000000000002" as Address;
const token = "0x0000000000000000000000000000000000000003" as Address,
  other = "0x0000000000000000000000000000000000000004" as Address;
const hash = "0x" + "11".repeat(32),
  now = 1_800_000_000;
function fixture() {
  const state = {
    chainId: 84532,
    code: "0x6000",
    inventory: [token],
    enabled: true,
    amount: 100n,
    balance: 1000n,
    canDrip: true,
    next: 0n,
    nativeBalance: 1n,
    blockHash: hash,
    canonicalHash: hash,
    timestamp: BigInt(now - 2),
  };
  const calls: string[] = [];
  const client = {
    getChainId: async () => state.chainId,
    getBlock: async (options: { blockTag?: string; blockNumber?: bigint }) => {
      calls.push("block");
      if (options.blockTag) expect(options.blockTag).toBe("latest");
      else expect(options.blockNumber).toBe(10n);
      return {
        number: 10n,
        hash: options.blockTag ? state.blockHash : state.canonicalHash,
        timestamp: state.timestamp,
      };
    },
    getCode: async (options: { address: string; blockNumber: bigint }) => {
      expect(options).toEqual({ address: faucet, blockNumber: 10n });
      return state.code;
    },
    getBalance: async (options: { address: string; blockNumber: bigint }) => {
      expect(options).toEqual({ address: recipient, blockNumber: 10n });
      return state.nativeBalance;
    },
    readContract: async (options: { functionName: string; blockNumber: bigint; args?: unknown[] }) => {
      expect(options.blockNumber).toBe(10n);
      calls.push(options.functionName);
      switch (options.functionName) {
        case "getAllTokens":
          return state.inventory;
        case "enabledTokens":
          return state.enabled;
        case "dripAmount":
          return state.amount;
        case "canDrip":
          expect(options.args).toEqual([token, recipient]);
          return [state.canDrip, state.next];
        case "balanceOf":
          return state.balance;
        default:
          throw new Error("Unexpected read");
      }
    },
  };
  return {
    state,
    calls,
    client: client as unknown as PublicClient,
    read: (expected?: readonly Address[]) =>
      readFaucetStatus(client as unknown as PublicClient, faucet, recipient, expected),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
});
afterEach(() => vi.useRealTimers());
describe("Base Sepolia test-token eligibility", () => {
  it("reads the published target at one canonical block and limits status lifetime", async () => {
    const f = fixture();
    const status = await f.read([token]);
    expect(status).toMatchObject({
      address: faucet,
      recipient,
      chainId: 84532,
      ready: true,
      configured: true,
      nativeBalance: 1n,
      blockNumber: 10n,
      blockHash: hash,
      evaluatedAt: now,
      validUntil: now + 20,
    });
    expect(f.calls.filter((name) => name === "block")).toHaveLength(2);
  });
  it("rejects the wrong chain before inspecting inventory", async () => {
    const f = fixture();
    f.state.chainId = 8453;
    await expect(f.read()).rejects.toThrow("Base Sepolia");
    expect(f.calls).toHaveLength(0);
  });
  it("distinguishes an unconfigured dispenser", async () => {
    const f = fixture();
    f.state.inventory = [];
    expect(await f.read()).toMatchObject({ ready: false, configured: false, tokens: [] });
  });
  it("distinguishes empty funds from wallet cooldown", async () => {
    const f = fixture();
    f.state.balance = 99n;
    f.state.canDrip = false;
    const status = await f.read();
    expect(status.ready).toBe(false);
    expect(status.tokens[0]).toMatchObject({ funded: false, nextDripTime: 0 });
  });
  it("preserves recipient-specific cooldown without claiming a funded token is available", async () => {
    const f = fixture();
    f.state.canDrip = false;
    f.state.next = BigInt(now + 86400);
    expect((await f.read()).tokens[0]).toMatchObject({ funded: true, canDrip: false, nextDripTime: now + 86400 });
  });
  it("does not mistake a gas balance for dispensable token funds", async () => {
    const f = fixture();
    f.state.nativeBalance = 0n;
    const status = await f.read();
    expect(status.ready).toBe(true);
    expect(status.nativeBalance).toBe(0n);
  });
  it("rejects nonexistent configured targets", async () => {
    const f = fixture();
    f.state.code = "0x";
    await expect(f.read()).rejects.toThrow("no contract");
  });
  it("rejects duplicate or unexpected inventory", async () => {
    const f = fixture();
    f.state.inventory = [token, token];
    await expect(f.read()).rejects.toThrow("duplicate");
    f.state.inventory = [token];
    await expect(f.read([other])).rejects.toThrow("reviewed deployment");
  });
  it("fails closed for provisional or reorganized block evidence", async () => {
    const f = fixture();
    f.state.blockHash = "0x" + "00".repeat(32);
    await expect(f.read()).rejects.toThrow("confirmed block");
    f.state.blockHash = hash;
    f.state.canonicalHash = "0x" + "22".repeat(32);
    await expect(f.read()).rejects.toThrow("changed during verification");
  });
  it("rejects stale and future block timestamps", async () => {
    const f = fixture();
    f.state.timestamp = BigInt(now - 120);
    await expect(f.read()).rejects.toThrow("out of date");
    f.state.timestamp = BigInt(now + 1);
    await expect(f.read()).rejects.toThrow("out of date");
  });
  it("does not trust inconsistent eligibility flags", async () => {
    const f = fixture();
    f.state.enabled = false;
    expect((await f.read()).ready).toBe(false);
    f.state.enabled = true;
    f.state.next = BigInt(now + 1);
    expect((await f.read()).ready).toBe(false);
  });
});
