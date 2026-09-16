import { useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { parseAbi, type Address } from "viem";
import registry from "../../../config/deployment.json";
import expanded from "../../../config/expanded-assets.json";
import { client, useWallet, useBalance } from "./wallet";
import { amount, fmt } from "./lib";
import { FundingGate } from "./Funding";
import { TokenIcon } from "./AssetImage";
const faucetAbi = parseAbi([
  "function requestFunds(address)",
  "function faucetDripAmount() view returns(uint256)",
  "function maxDripFrequency() view returns(uint256)",
  "function lastDripTimestamp() view returns(uint256)",
]);
const wrapperAbi = parseAbi(["function deposit() payable", "function withdraw(uint256)"]);
export function ExpandedFunding() {
  const wallet = useWallet(),
    [input, setInput] = useState("0.01");
  const ausd = registry.assets.find((a) => a.id === "agora-ausd"),
    wmon = registry.assets.find((a) => a.id === "canonical-wmon");
  const usdBalance = useBalance(ausd?.address as Address | undefined),
    wrappedBalance = useBalance(wmon?.address as Address | undefined);
  const status = useSWR(
    ausd ? `faucet:agora:${wallet.account || "public"}` : null,
    async () => {
      const address = expanded.faucet.address as Address;
      const [drip, frequency, last] = (await Promise.all(
        (["faucetDripAmount", "maxDripFrequency", "lastDripTimestamp"] as const).map((functionName) =>
          client.readContract({ address, abi: faucetAbi, functionName }),
        ),
      )) as bigint[];
      return { drip, readyAt: Number(last + frequency) * 1000 };
    },
    { refreshInterval: 12000 },
  );
  if (!ausd) return null;
  let value = 0n;
  try {
    value = amount(input, 18);
  } catch {}
  const act = (label: string, fn: () => Promise<unknown>) =>
    wallet.account ? wallet.execute(label, fn) : wallet.connect();
  return (
    <section className="faucet-step">
      <h2>More Monad tokens</h2>
      <div className="token-grid">
        <article className="action-panel" id="agora-ausd">
          <TokenIcon asset={ausd} />
          <h3>Agora AUSD</h3>
          <p className="field-hint">Test dollars for backing pools.</p>
          <p>Balance: {fmt(usdBalance.error ? undefined : usdBalance.data, 6)} AUSD</p>
          <FundingGate>
            <button
              className="button purple-button full"
              disabled={wallet.busy || (!!wallet.account && (!status.data || status.data.readyAt > Date.now()))}
              onClick={() =>
                act("Claim AUSD", () =>
                  wallet.send({
                    address: expanded.faucet.address as Address,
                    abi: faucetAbi,
                    functionName: "requestFunds",
                    args: [wallet.account],
                  }),
                )
              }
            >
              {!wallet.account
                ? "Connect wallet"
                : status.data?.readyAt && status.data.readyAt > Date.now()
                  ? "Faucet cooling down…"
                  : `Claim ${status.data ? fmt(status.data.drip, 6) : ""} AUSD`}
            </button>
          </FundingGate>
          <p className="field-hint">Shared faucet · Availability refreshes automatically.</p>
          <Link to="/create-pool?asset=wmon&backing=agora-ausd">Create an AUSD-backed pool ↗</Link>
        </article>
        {wmon && (
          <article className="action-panel" id="monad-wrap">
            <TokenIcon asset={wmon} />
            <h3>Monad WMON</h3>
            <p className="field-hint">The wrapper listed by Monad.</p>
            <p>Balance: {fmt(wrappedBalance.error ? undefined : wrappedBalance.data, 18)} WMON</p>
            <label className="field">
              MON amount
              <input
                inputMode="decimal"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={wallet.busy}
              />
            </label>
            <FundingGate>
              <button
                className="button purple-button full"
                disabled={wallet.busy || value <= 0n}
                onClick={() =>
                  act("Wrap Monad MON", () =>
                    wallet.send({ address: wmon.address as Address, abi: wrapperAbi, functionName: "deposit", value }),
                  )
                }
              >
                {wallet.account ? "Wrap MON" : "Connect wallet"}
              </button>
            </FundingGate>
            <button
              className="button full"
              disabled={
                wallet.busy ||
                !wallet.account ||
                value <= 0n ||
                wrappedBalance.error ||
                wrappedBalance.data === undefined ||
                wrappedBalance.data < value
              }
              onClick={() =>
                act("Unwrap Monad WMON", () =>
                  wallet.send({
                    address: wmon.address as Address,
                    abi: wrapperAbi,
                    functionName: "withdraw",
                    args: [value],
                  }),
                )
              }
            >
              Unwrap WMON
            </button>
          </article>
        )}
      </div>
    </section>
  );
}
