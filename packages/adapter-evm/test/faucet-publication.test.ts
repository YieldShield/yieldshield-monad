import { describe, expect, it, vi } from "vitest";
import { zeroAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
import { createEvmAdapter } from "../src/adapter";

vi.mock("../src/deployments", () => ({ DEPLOYMENTS: {} }));
vi.mock("../src/faucet-deployments", () => ({
  FAUCET_DEPLOYMENTS: { 84532: "0x0000000000000000000000000000000000000001" },
}));

describe("independent test-token faucet publication", () => {
  it("allows test tokens without publishing protocol entrypoints", async () => {
    const adapter = createEvmAdapter({ chain: baseSepolia });
    expect(adapter.info.capabilities.faucet).toBe(true);
    expect(adapter.addresses.faucet).toBe("0x0000000000000000000000000000000000000001");
    expect(adapter.addresses.factory).toBe(zeroAddress);
    expect(adapter.addresses.compositeOracle).toBe(zeroAddress);
    await expect(adapter.reader.loadPools()).rejects.toThrow("awaiting deployment");
  });
  it("honors an explicit disable and never enables the test faucet on mainnet", () => {
    expect(createEvmAdapter({ chain: baseSepolia, faucetAddress: null }).info.capabilities.faucet).toBe(false);
    expect(createEvmAdapter({ chain: base }).info.capabilities.faucet).toBe(false);
  });
  it("preserves an explicitly configured faucet", () => {
    const faucetAddress = "0x0000000000000000000000000000000000000002";
    expect(createEvmAdapter({ chain: baseSepolia, faucetAddress }).addresses.faucet).toBe(faucetAddress);
  });
});
