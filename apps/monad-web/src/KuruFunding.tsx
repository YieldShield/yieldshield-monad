import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { parseUnits } from "viem";
import { client, useWallet } from "./wallet";
import { fmt, errorMessage } from "./lib";
import { FundingGate } from "./Funding";
import {
  KURU,
  kuruAccountAbi,
  kuruFaucetAbi,
  verifyKuruTarget,
  readKuruIdentity,
  readKuruAccount,
  quoteKuruBuy,
  buildKuruSwapRequest,
  confirmedKuruSwap,
  type KuruQuote,
} from "../../../services/monad/kuru-contracts.mjs";

export function KuruFunding() {
  const [open, setOpen] = useState(false);
  return (
    <details className="faucet-step" id="kuru-mon" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Buy testnet MON with Kuru</summary>
      {open ? <KuruFundingFlow /> : null}
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
  const faucet = useSWR(
    wallet.account ? `faucet:kuru:${wallet.account}` : null,
    async () =>
      BigInt(
        (await client.readContract({
          address: KURU.faucet,
          abi: kuruFaucetAbi,
          functionName: "nextClaimAt",
          args: [wallet.account],
        })) as bigint,
      ),
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
  const activeQuote =
    quote &&
    quote.account.toLowerCase() === wallet.account?.toLowerCase() &&
    quote.amountIn === value &&
    quote.userId === data?.userId
      ? quote
      : null;
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
      await verifyKuruTarget(client, KURU.account);
      const current = await readKuruAccount(client, selectedAccount());
      const available = token === KURU.native ? current.mon : current.usdc;
      if (amount <= 0n || available < amount) throw new Error("Kuru balance changed. Refresh and try again.");
      await wallet.send({
        address: KURU.account,
        abi: kuruAccountAbi,
        functionName: "withdraw",
        args: [token, amount],
      });
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
      <p className="field-hint">Kuru test USDC is a separate test token, not YieldShield TestUSDC or real USDC.</p>
      <p>
        Wallet: {fmt(data?.walletUsdc, 6)} Kuru test USDC · At Kuru: {fmt(data?.usdc, 6)} Kuru test USDC /{" "}
        {fmt(data?.mon, 18)} MON
      </p>
      {balances.error ? <p role="alert">Kuru balances unavailable. Refresh before continuing.</p> : null}
      <FundingGate>
        <button
          className="button"
          disabled={
            working || faucet.error || faucet.data === undefined || faucet.data > BigInt(Math.floor(Date.now() / 1000))
          }
          onClick={() =>
            run("Claim Kuru test tokens", async () => {
              await verifyKuruTarget(client, KURU.faucet);
              await wallet.send({ address: KURU.faucet, abi: kuruFaucetAbi, functionName: "claim" });
            })
          }
        >
          {faucet.data && faucet.data > BigInt(Math.floor(Date.now() / 1000))
            ? "Kuru faucet cooling down"
            : "Claim Kuru test tokens"}
        </button>
      </FundingGate>
      <p className="field-hint">The faucet sends a test-token bundle. It does not supply MON for gas.</p>
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
                if (current.walletUsdc < missing) throw new Error("Claim Kuru test tokens first.");
                await wallet.approve(KURU.usdc, KURU.account, missing);
                await wallet.send({
                  address: KURU.account,
                  abi: kuruAccountAbi,
                  functionName: "deposit",
                  args: [KURU.usdc, missing],
                });
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
        <p role="status">Bought {fmt(received.amount, 18)} MON. Withdraw it below; it is not protected yet.</p>
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
        <a href="#wrap-mon">Wrap MON</a> · <Link to="/protect">Choose protection ↗</Link>
      </p>
    </div>
  );
}
