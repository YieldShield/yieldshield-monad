import type { Account, Address, Chain, Transport, WalletClient } from "viem";
export type DynamicSession = {
  address: Address;
  getClient: () => Promise<WalletClient<Transport, Chain, Account>>;
  switchNetwork: (chainId: number) => Promise<void>;
  logout: () => Promise<void>;
};
/** Re-read the selected account and network before every wallet request. */
export async function ensureDynamicSession(session: DynamicSession, expected: Address) {
  let wallet = await session.getClient();
  if ((await wallet.getChainId()) !== 10143) {
    await session.switchNetwork(10143);
    wallet = await session.getClient();
  }
  if ((await wallet.getChainId()) !== 10143) throw new Error("Switch to Monad Testnet to continue.");
  const addresses = await wallet.getAddresses();
  if (
    session.address.toLowerCase() !== expected.toLowerCase() ||
    wallet.account.address.toLowerCase() !== expected.toLowerCase() ||
    addresses[0]?.toLowerCase() !== expected.toLowerCase()
  )
    throw new Error("Wallet account changed. Reconnect before continuing.");
  return wallet;
}
