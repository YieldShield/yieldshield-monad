import { describe, expect, it, vi } from "vitest";
import { ensureDynamicSession, type DynamicSession } from "./dynamic-session";
const address = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
function fixture(chain = 10143, selected = address) {
  let network = chain;
  const wallet = {
    account: { address: selected },
    getChainId: vi.fn(async () => network),
    getAddresses: vi.fn(async () => [selected]),
  };
  const session = {
    address,
    getClient: vi.fn(async () => wallet),
    switchNetwork: vi.fn(async (id: number) => {
      network = id;
    }),
    logout: vi.fn(),
  };
  return { wallet, session: session as unknown as DynamicSession };
}
describe("Dynamic transaction identity", () => {
  it("checks the selected account and chain for a connected wallet", async () => {
    const { wallet, session } = fixture();
    expect(await ensureDynamicSession(session, address)).toBe(wallet);
    expect(wallet.getAddresses).toHaveBeenCalled();
  });
  it("switches and reacquires the wallet client before a Monad transaction", async () => {
    const { session } = fixture(1);
    await ensureDynamicSession(session, address);
    expect(session.switchNetwork).toHaveBeenCalledWith(10143);
    expect(session.getClient).toHaveBeenCalledTimes(2);
  });
  it("rejects a switch that does not take effect", async () => {
    const { session } = fixture(1);
    session.switchNetwork = vi.fn(async () => {});
    await expect(ensureDynamicSession(session, address)).rejects.toThrow("Switch to Monad Testnet");
  });
  it("rejects account changes before signing", async () => {
    const { session } = fixture(10143, other);
    await expect(ensureDynamicSession(session, address)).rejects.toThrow("Wallet account changed");
  });
});
