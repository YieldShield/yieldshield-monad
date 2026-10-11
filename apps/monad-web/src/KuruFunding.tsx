import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { parseUnits } from "viem";
import { client, useWallet } from "./wallet";
import { fmt, errorMessage } from "./lib";
import { FundingGate } from "./Funding";
import { reviewableKuruQuote } from "./kuru-funding-state";
import {
  KURU,
  KURU_LEGACY,
  readKuruIdentity,
  readKuruAccount,
  quoteKuruBuy,
  buildKuruSwapRequest,
  confirmedKuruSwap,
  buildKuruDepositRequest,
  buildKuruWithdrawalRequest,
  readKuruWithdrawalReadiness,
  readLegacyKuruAccount,
  buildLegacyKuruWithdrawalRequest,
  type KuruQuote,
} from "../../../services/monad/kuru-contracts.mjs";

export function KuruFunding() {
  const [open, setOpen] = useState(false);
  return (
    <details className="faucet-step" id="kuru-mon" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Buy testnet MON with Kuru</summary>
      {open ? (
        <>
          <KuruFundingFlow />
          <LegacyKuruRecovery />
        </>
      ) : null}
    </details>
  );
}

function KuruFundingFlow() {
  const wallet = useWallet();
  const selectedAccount = () => {
    if (!wallet.account) throw new Error("Connect a wallet first.");
    return wallet.account;
  };
  const [input, setInput] = useState("10");
  const [quote, setQuote] = useState<KuruQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [received, setReceived] = useState<{ account: string; amount: bigint } | null>(null);
  const balances = useSWR(
    wallet.account ? `balance:kuru:${wallet.account}` : null,
    () => readKuruAccount(client, selectedAccount()),
    { refreshInterval: 15000, shouldRetryOnError: false },
  );
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setQuote(null), Math.max(0, quote.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [quote]);
  let value = 0n;
  try {
    if (/^\d+(\.\d{1,6})?$/.test(input)) value = parseUnits(input, 6);
  } catch {
    /* Invalid input disables preparation and quoting. */
  }
  const data = balances.error ? undefined : balances.data;
  const valid = value >= KURU.minInput && value <= KURU.maxInput;
  const activeQuote = reviewableKuruQuote(quote, {
    account: wallet.account,
    userId: data?.userId,
    amountIn: value,
    freeUsdc: data?.usdc,
  });
  const working = wallet.busy || quoting;
  const run = (label: string, fn: () => Promise<unknown>) =>
    wallet.execute(label, async () => {
      setError("");
      await fn();
      await balances.mutate();
    });
  async function getQuote() {
    setQuoting(true);
    setError("");
    setQuote(null);
    try {
      const result = await quoteKuruBuy(client, { account: selectedAccount(), amountIn: value });
      setQuote(result);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setQuoting(false);
    }
  }
  async function buy() {
    if (!activeQuote) throw new Error("Request a fresh Kuru quote.");
    const account = selectedAccount();
    await readKuruIdentity(client);
    const before = await readKuruAccount(client, account);
    if (before.usdc < value) throw new Error("Deposit Kuru test USDC first.");
    const request = buildKuruSwapRequest(activeQuote, account, before.userId);
    const receipt = await wallet.send(request);
    const settled = confirmedKuruSwap(receipt, activeQuote, account);
    setQuote(null);
    const after = await readKuruAccount(client, account);
    if (after.mon < before.mon + settled.amountOut)
      throw new Error("Trade confirmed; refresh your Kuru balance before withdrawing.");
    setReceived({ account, amount: settled.amountOut });
  }
  const withdraw = (token: typeof KURU.native, amount: bigint) =>
    run("Withdraw from Kuru", async () => {
      const current = await readKuruAccount(client, selectedAccount());
      const request = buildKuruWithdrawalRequest(current, token, amount);
      await readKuruWithdrawalReadiness(client, token, amount);
      await wallet.send(request);
    });
  if (!wallet.account)
    return (
      <div className="action-panel">
        <p>Optional: swap Kuru test USDC for native MON, then wrap it and choose protection.</p>
        <button className="button purple-button" onClick={wallet.connect}>
          Connect wallet
        </button>
      </div>
    );
  return (
    <div className="action-panel">
      <p>Optional · Kuru test USDC → MON. Protection opens separately.</p>
      <p className="field-hint">
        This uses Kuru's current testnet deployment and its new test USDC. September faucet tokens are not compatible.
        Test tokens and quotes do not represent real USDC or a dollar market price.
      </p>
      <p>
        Wallet: {fmt(data?.walletUsdc, 6)} Kuru test USDC · At Kuru: {fmt(data?.usdc, 6)} Kuru test USDC /{" "}
        {fmt(data?.mon, 18)} MON
      </p>
      {balances.error ? <p role="alert">Kuru balances unavailable. Refresh before continuing.</p> : null}
      <p className="field-hint">
        There is no public faucet for the current Kuru token. Request test USDC from your Kuru integration contact.{" "}
        <a href="https://kuru-testnet-docs.mintlify.site/deployments/setup" target="_blank" rel="noreferrer">
          Official setup instructions ↗
        </a>
      </p>
      <label className="field">
        Kuru test USDC to spend
        <input
          inputMode="decimal"
          value={input}
          disabled={working}
          aria-describedby="kuru-limit"
          onChange={(event) => {
            setInput(event.target.value);
            setQuote(null);
          }}
        />
      </label>
      <p className="field-hint" id="kuru-limit">
        10–100 per swap · Maximum slippage 0.5%
      </p>
      {data && data.usdc < value ? (
        <FundingGate>
          <button
            className="button"
            disabled={working || !valid || data.walletUsdc < value - data.usdc}
            onClick={() =>
              run("Deposit to your Kuru account", async () => {
                await readKuruIdentity(client);
                const current = await readKuruAccount(client, selectedAccount());
                const missing = value - current.usdc;
                if (missing <= 0n) return;
                if (current.walletUsdc < missing)
                  throw new Error("Request current Kuru test USDC from your Kuru integration contact first.");
                await wallet.approve(KURU.usdc, KURU.account, missing);
                await wallet.send(buildKuruDepositRequest(selectedAccount(), missing));
                setQuote(null);
              })
            }
          >
            Deposit {fmt(value - data.usdc, 6)} to Kuru
          </button>
        </FundingGate>
      ) : null}
      <button className="button" disabled={working || !valid || !data || data.usdc < value} onClick={getQuote}>
        {quoting ? "Checking Kuru…" : "Get quote"}
      </button>
      {activeQuote ? (
        <div role="status">
          <p>
            Estimated: {fmt(activeQuote.amountOut, 18)} MON · Minimum: {fmt(activeQuote.minAmountOut, 18)} MON
          </p>
          <FundingGate>
            <button className="button purple-button" disabled={working} onClick={() => run("Buy MON on Kuru", buy)}>
              Buy MON
            </button>
          </FundingGate>
          <p className="field-hint">
            Quote valid for one minute. Bought MON stays in your Kuru account until withdrawn.
          </p>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {received?.account.toLowerCase() === wallet.account.toLowerCase() ? (
        <p role="status">Bought {fmt(received.amount, 18)} MON through Kuru. Protection opens separately.</p>
      ) : null}
      {data && (data.mon > 0n || data.usdc > 0n) ? (
        <div>
          {data.mon > 0n ? (
            <FundingGate>
              <button className="button" disabled={working} onClick={() => withdraw(KURU.native, data.mon)}>
                Withdraw {fmt(data.mon, 18)} MON
              </button>
            </FundingGate>
          ) : null}
          {data.usdc > 0n ? (
            <FundingGate>
              <button className="button" disabled={working} onClick={() => withdraw(KURU.usdc, data.usdc)}>
                Return unused Kuru test USDC
              </button>
            </FundingGate>
          ) : null}
          <p className="field-hint">Withdrawals go to your connected wallet. Only free Kuru balances are shown.</p>
        </div>
      ) : null}
      <p>
        <a href="#wrap-mon">Wrap MON</a> · <Link to="/protect?market=wmon-usd">Choose MON protection ↗</Link>
      </p>
    </div>
  );
}

function LegacyKuruRecovery() {
  const wallet = useWallet();
  const legacy = useSWR(
    wallet.account ? `balance:kuru-legacy:${wallet.account}` : null,
    () => readLegacyKuruAccount(client, wallet.account!),
    { refreshInterval: 15000, shouldRetryOnError: false },
  );
  if (!wallet.account) return null;
  const withdraw = (token: typeof KURU.native, amount: bigint) =>
    wallet.execute("Recover legacy Kuru balance", async () => {
      const current = await readLegacyKuruAccount(client, wallet.account!);
      await wallet.send(buildLegacyKuruWithdrawalRequest(current, token, amount));
      await legacy.mutate();
    });
  return (
    <details className="action-panel">
      <summary>September Kuru balances</summary>
      <p>The old deployment is available for withdrawals only. Its balances do not fund the current market.</p>
      {legacy.error ? (
        <p role="alert">
          Legacy Kuru balances unavailable.{" "}
          <button className="text-link" onClick={() => void legacy.mutate()}>
            Retry
          </button>
        </p>
      ) : !legacy.data ? (
        <p>Checking legacy balances…</p>
      ) : (
        <>
          <p>In your wallet: {fmt(legacy.data.walletUsdc, 6)} old test USDC.</p>
          <p>
            At the old Kuru account: {fmt(legacy.data.usdc, 6)} old test USDC · {fmt(legacy.data.mon, 18)} MON.
          </p>
          {legacy.data.mon > 0n ? (
            <FundingGate>
              <button className="button" disabled={wallet.busy} onClick={() => withdraw(KURU.native, legacy.data!.mon)}>
                Withdraw legacy MON
              </button>
            </FundingGate>
          ) : null}
          {legacy.data.usdc > 0n ? (
            <FundingGate>
              <button
                className="button"
                disabled={wallet.busy}
                onClick={() => withdraw(KURU_LEGACY.usdc, legacy.data!.usdc)}
              >
                Withdraw legacy test USDC
              </button>
            </FundingGate>
          ) : null}
        </>
      )}
    </details>
  );
}
