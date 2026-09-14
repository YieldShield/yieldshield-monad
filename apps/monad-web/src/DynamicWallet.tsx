import { useEffect, useRef } from "react";
import { DynamicContextProvider, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors, isEthereumWallet } from "@dynamic-labs/ethereum";
import type { Address } from "viem";
import type { DynamicSession } from "./dynamic-session";
import config from "../../../config/monad.json";

type Props = { openRequest: number; onSession: (session: DynamicSession | null) => void };
const settings = {
  environmentId: "71020229-55c2-4143-8352-9bf007358fff",
  appName: "YieldShield on Monad",
  walletConnectors: [EthereumWalletConnectors],
  transactionConfirmation: { required: true },
  initialAuthenticationMode: "connect-and-sign" as const,
  privacyPolicyUrl: "https://monad.yieldshield.ai/legal",
  termsOfServiceUrl: "https://monad.yieldshield.ai/legal",
  overrides: {
    evmNetworks: [
      {
        blockExplorerUrls: [config.explorerUrl],
        chainId: 10143,
        networkId: 10143,
        name: "Monad Testnet",
        nativeCurrency: { decimals: 18, name: "Monad", symbol: "MON" },
        rpcUrls: [config.rpcUrl],
        iconUrls: [],
        vanityName: "Monad Testnet",
        isTestnet: true,
      },
    ],
  },
};
function Connection({ openRequest, onSession }: Props) {
  const { primaryWallet, sdkHasLoaded, setShowAuthFlow, handleLogOut } = useDynamicContext();
  const current = useRef(primaryWallet);
  current.current = primaryWallet;
  const handledRequest = useRef(0);
  useEffect(() => {
    if (!sdkHasLoaded || openRequest <= handledRequest.current) return;
    handledRequest.current = openRequest;
    if (!primaryWallet) setShowAuthFlow(true);
  }, [openRequest, sdkHasLoaded, primaryWallet, setShowAuthFlow]);
  useEffect(() => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      onSession(null);
      return;
    }
    onSession({
      address: primaryWallet.address as Address,
      getClient: async () => {
        const wallet = current.current;
        if (!wallet || !isEthereumWallet(wallet)) throw new Error("Reconnect your Dynamic wallet.");
        return wallet.getWalletClient();
      },
      switchNetwork: async (chainId) => {
        const wallet = current.current;
        if (!wallet || !isEthereumWallet(wallet)) throw new Error("Reconnect your Dynamic wallet.");
        await wallet.switchNetwork(chainId);
      },
      logout: handleLogOut,
    });
  }, [primaryWallet, handleLogOut, onSession]);
  return null;
}
export default function DynamicWallet(props: Props) {
  return (
    <DynamicContextProvider settings={settings}>
      <Connection {...props} />
    </DynamicContextProvider>
  );
}
