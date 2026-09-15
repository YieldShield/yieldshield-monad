import { Link, useLocation } from "react-router-dom";
import deployment from "../../../config/deployment.json";
import config from "../../../config/monad.json";
import type { Address } from "viem";
import type { ReactNode } from "react";
import { useBalance, useNativeBalance, useWallet } from "./wallet";

export const monadFaucet = "https://faucet.monad.xyz";
export type FundingAsset = { symbol: string; balance: bigint | undefined };

// Unknown or failed reads must never be treated as an empty wallet.
export function fundingStep(connected: boolean, native: bigint | undefined, assets: (bigint | undefined)[]) {
  if (!connected) return "connect";
  if (native === 0n) return "gas";
  if (native !== undefined && native > 0n && assets.length > 0 && assets.every((value) => value === 0n))
    return "tokens";
  return null;
}

export function assetPreparation(symbol: string) {
  switch (symbol) {
    case "WMON":
      return { to: "/faucet#wrap-mon", label: "Wrap MON" };
    case "shMON":
      return { to: "/faucet#stake-mon", label: "Stake MON" };
    case "vTestUSDC":
      return { to: "/faucet#test-vault", label: "Get vault shares" };
    default:
      return { to: "/faucet#test-tokens", label: `Claim ${symbol}` };
  }
}

export function FundingNotice() {
  const { account } = useWallet();
  const { pathname } = useLocation();
  const native = useNativeBalance();
  const usd = useBalance(deployment.contracts.TestUSDC.address as Address);
  const scenario = useBalance(deployment.contracts.ScenarioMON.address as Address);
  const wrapped = useBalance(deployment.contracts.WMON.address as Address);
  const staked = useBalance(config.externalTokens.shMON as Address);
  const vault = useBalance(deployment.contracts.TestUSDVault.address as Address);
  const step = fundingStep(
    !!account,
    native.error ? undefined : native.data,
    [usd, scenario, wrapped, staked, vault].map((balance) => (balance.error ? undefined : balance.data)),
  );
  const needsFunding =
    ["/protect", "/provide", "/positions", "/trade", "/create-pool"].includes(pathname) ||
    pathname.startsWith("/positions/");
  if (!needsFunding || !step) return null;
  return (
    <section className="notice funding-notice" aria-label="Get started with test tokens" role="status">
      <strong>
        {step === "gas"
          ? "Get testnet MON to pay fees."
          : step === "tokens"
            ? "Get tokens before you start."
            : "Need test tokens?"}
      </strong>
      {step === "gas" ? (
        <a className="button purple-button" href={monadFaucet} target="_blank" rel="noreferrer">
          Monad faucet ↗
        </a>
      ) : (
        <Link className="button purple-button" to="/faucet">
          Faucet ↗
        </Link>
      )}
    </section>
  );
}

export function AssetFundingHint({ asset }: { asset: FundingAsset | undefined }) {
  const { account } = useWallet();
  if (!account || !asset || asset.balance !== 0n) return null;
  const preparation = assetPreparation(asset.symbol);
  return (
    <p className="asset-funding-hint">
      No {asset.symbol}. <Link to={preparation.to}>{preparation.label} ↗</Link>
    </p>
  );
}

export function FundingGate({ asset, children }: { asset?: FundingAsset; children: ReactNode }) {
  const wallet = useWallet();
  const native = useNativeBalance();
  if (wallet.account && !wallet.busy && !native.error && native.data === 0n) {
    return (
      <a className="button purple-button full" href={monadFaucet} target="_blank" rel="noreferrer">
        Get testnet MON first ↗
      </a>
    );
  }
  if (wallet.account && !wallet.busy && asset?.balance === 0n) {
    const preparation = assetPreparation(asset.symbol);
    return (
      <Link className="button purple-button full" to={preparation.to}>
        {preparation.label} ↗
      </Link>
    );
  }
  return children;
}
