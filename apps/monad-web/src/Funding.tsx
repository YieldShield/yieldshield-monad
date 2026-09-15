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
      return { to: "/faucet#wrap-mon", copy: "Wrap testnet MON into WMON on the Faucet page." };
    case "shMON":
      return { to: "/faucet#stake-mon", copy: "Stake testnet MON for shMON on the Faucet page." };
    case "vTestUSDC":
      return { to: "/faucet#test-vault", copy: "Claim TestUSDC, then deposit it into the vault on the Faucet page." };
    default:
      return { to: "/faucet#test-tokens", copy: `Claim free ${symbol} on the Faucet page.` };
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
  if (pathname === "/faucet" || !step) return null;
  return (
    <section className="notice funding-notice" aria-label="Get started with test tokens" role="status">
      <div>
        <strong>
          {step === "gas"
            ? "Get testnet MON first."
            : step === "tokens"
              ? "Your next step: free test tokens."
              : "New here? Start at the Faucet."}
        </strong>
        <p>
          {step === "gas"
            ? "This wallet has no MON on Monad testnet. Get MON for transaction fees, then return to claim your test tokens."
            : step === "tokens"
              ? "Your wallet holds MON. Visit the Faucet to claim test tokens, wrap MON or prepare staking and vault assets."
              : "Get free MON for transaction fees and test tokens before your first trade or protected position."}
        </p>
      </div>
      {step === "gas" ? (
        <a className="button purple-button" href={monadFaucet} target="_blank" rel="noreferrer">
          Monad faucet ↗
        </a>
      ) : (
        <Link className="button purple-button" to="/faucet">
          Go to Faucet ↗
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
      You have no {asset.symbol}. {preparation.copy} <Link to={preparation.to}>Prepare {asset.symbol} ↗</Link>
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
    return (
      <Link className="button purple-button full" to={assetPreparation(asset.symbol).to}>
        Get {asset.symbol} at the Faucet ↗
      </Link>
    );
  }
  return children;
}
