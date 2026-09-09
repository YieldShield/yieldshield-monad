import { useEffect, useState } from "react";
import useSWR from "swr";
import { Link, useLocation } from "react-router-dom";
import { reader, chain } from "@/chain/adapter";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { useTokenBalance } from "@/data/balance";
import { AmountInput } from "@/components/AmountInput";
import { PendingOverlay, TransactionError } from "@/components/TxFeedback";
import { AssetGlyph, Button, Card } from "@/components/ui";
import { formatToken } from "@/lib/format";
import { parseTradeAmount } from "@/screens/trade-state";

/** Vault actions remain behind the chain port; every write rechecks the pinned vault and NAV. */
export function DemoVaults() {
  const { hash } = useLocation();
  const tx = useSubmitTx();
  const [symbol, setSymbol] = useState("vUSDC");
  const [action, setAction] = useState<"deposit" | "redeem" | "fund">("deposit");
  const [value, setValue] = useState("100");
  const {
    data: vaults,
    error,
    mutate,
  } = useSWR(reader.getDemoVaults ? ["demo-vaults"] : null, () => reader.getDemoVaults!(), { refreshInterval: 15000 });
  const vault = vaults?.find((v) => v.symbol === symbol);
  const vaultsLoaded = !!vaults?.length;
  useEffect(() => {
    if (vaultsLoaded && hash === "#yield-vaults") document.getElementById("yield-vaults")?.scrollIntoView();
  }, [vaultsLoaded, hash]);
  const amount = parseTradeAmount(value, vault?.decimals ?? 6);
  const input = action === "redeem" ? vault?.address : vault?.underlying;
  const inputSymbol = action === "redeem" ? symbol : (vault?.underlyingSymbol ?? "TestUSDC");
  const { balance, loading: checkingBalance } = useTokenBalance(input);
  const quote = useSWR(
    vault && amount.amount > 0n && !amount.error && action !== "fund" && reader.getDemoVaultQuote
      ? ["demo-vault-quote", vault.address, action, amount.amount.toString()]
      : null,
    () => reader.getDemoVaultQuote!(vault!.address, action as "deposit" | "redeem", amount.amount),
    { refreshInterval: 5000, keepPreviousData: false },
  );
  const now = Date.now() / 1000;
  const fresh = !!vault && vault.evaluatedAt <= now + 5 && vault.validUntil > now;
  const quoteFresh = !!quote.data && quote.data.validUntil > now && !quote.error;
  const minOut = quote.data ? (quote.data.amountOut * 9950n) / 10000n : 0n;
  const blocked = error
    ? "Vault backing could not be checked."
    : !fresh
      ? "Checking vault backing…"
      : (amount.error ??
        (amount.amount <= 0n
          ? "Enter an amount."
          : checkingBalance
            ? "Checking wallet balance…"
            : tx.owner && (balance === null || balance < amount.amount)
              ? `You need more ${inputSymbol}.`
              : action === "fund" && amount.amount > vault!.totalAssets / 1000n
                ? "A contribution may be up to 0.1% of vault assets."
                : action === "fund" && vault!.assetsPerShare >= (102n * 10n ** BigInt(vault!.decimals)) / 100n
                  ? "The funded yield budget is complete."
                  : action !== "fund" && (!quoteFresh || minOut <= 0n)
                    ? "Checking your vault quote…"
                    : null));
  function reset(nextAction = action, nextSymbol = symbol) {
    setAction(nextAction);
    setSymbol(nextSymbol);
    setValue(nextSymbol === "vWETH" ? "0.1" : nextAction === "fund" ? "10" : "100");
    tx.reset();
  }
  async function submit() {
    if (!vault || blocked || !tx.owner || tx.pending) return;
    const result = await tx.submit({
      kind: action === "deposit" ? "vaultDeposit" : action === "redeem" ? "vaultRedeem" : "fundTestYield",
      vault: vault.address,
      amount: amount.amount,
      minOut: action === "fund" ? 1n : minOut,
    });
    if (result) {
      void mutate();
      void quote.mutate();
    }
  }
  if (!vaults?.length && !error) return null;
  return (
    <Card className="mt-7">
      {tx.pending && (
        <PendingOverlay label="Confirming your vault action…" phase={tx.phase} step={tx.step} txId={tx.txId} />
      )}
      <div className="grid gap-7 lg:grid-cols-2">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-ink">Backed vault shares</p>
          <h2 className="mt-3 text-[28px] font-extrabold tracking-tight2">Put the underlying to work.</h2>
          <p className="mt-3 max-w-[50ch] text-[14px] leading-relaxed text-body">
            Deposit TestUSDC or tWETH and receive vault shares. Funded test yield adds underlying tokens to the vault,
            increasing assets per share. You can redeem your shares at the current rate.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-body">
            Use vUSDC as junior collateral for stocks and crypto, or protect vWETH as a senior position.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {vaults?.map((v) => (
              <button
                key={v.address}
                type="button"
                disabled={tx.pending}
                aria-pressed={v.symbol === symbol}
                onClick={() => reset(action, v.symbol)}
                className={`flex items-center gap-2 rounded-input border px-4 py-3 font-bold ${v.symbol === symbol ? "border-ink bg-subtle" : "border-hairline"}`}
              >
                <AssetGlyph glyph="generic" label={v.symbol} symbol={v.symbol} size={32} />
                {v.symbol}
              </button>
            ))}
          </div>
          {vault && (
            <dl className="mt-5 space-y-3 text-[14px]">
              <div className="flex justify-between gap-3">
                <dt className="text-body">1 {symbol} redeems for</dt>
                <dd className="font-bold tnum">
                  {formatToken(vault.assetsPerShare, vault.decimals, vault.underlyingSymbol, 6)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-body">Underlying held</dt>
                <dd className="font-bold tnum">
                  {formatToken(vault.totalAssets, vault.decimals, vault.underlyingSymbol, 2)}
                </dd>
              </div>
            </dl>
          )}
          <p className="mt-4 text-[12px] leading-relaxed text-body">
            Test yield is supplied through token contributions, with no promised APY. A contribution benefits all
            existing shares and mints no new shares. Treasury issuer integrations are separate.
          </p>
          <Link
            to={symbol === "vUSDC" ? "/provide" : "/protection/new?asset=vWETH"}
            className={`mt-5 inline-block font-bold ${symbol === "vUSDC" ? "text-junior" : "text-senior"}`}
          >
            {symbol === "vUSDC" ? "Provide vault-backed collateral →" : "Protect vWETH →"}
          </Link>
        </div>
        <div>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {(["deposit", "redeem", "fund"] as const).map((a) => (
              <button
                type="button"
                key={a}
                disabled={tx.pending}
                aria-pressed={a === action}
                onClick={() => reset(a)}
                className={`min-h-12 rounded-input px-2 text-[13px] font-bold ${a === action ? "bg-ink text-white" : "bg-subtle"}`}
              >
                {a === "deposit" ? "Deposit" : a === "redeem" ? "Redeem" : "Fund test yield"}
              </button>
            ))}
          </div>
          <AmountInput
            value={value}
            onChange={setValue}
            symbol={inputSymbol}
            error={amount.error}
            balanceLabel={
              balance !== null && vault ? `Wallet: ${formatToken(balance, vault.decimals, inputSymbol, 6)}` : undefined
            }
          />
          <p className="mt-4 text-[14px] leading-relaxed text-body">
            {action === "fund"
              ? "You contribute underlying tokens to all existing shareholders. This is a contribution, not a deposit; you receive no shares."
              : quoteFresh && vault
                ? `You receive approximately ${formatToken(quote.data!.amountOut, vault.decimals, action === "deposit" ? symbol : vault.underlyingSymbol, 6)}. Minimum accepted: ${formatToken(minOut, vault.decimals, action === "deposit" ? symbol : vault.underlyingSymbol, 6)} (0.5% tolerance).`
                : "A fresh quote will show the shares or underlying you receive."}
          </p>
          {blocked && (
            <p role="status" className="mt-3 text-[13px] text-body">
              {blocked}
            </p>
          )}
          {tx.owner ? (
            <Button
              variant="primary"
              full
              className="mt-5"
              disabled={!!blocked || tx.pending}
              onClick={() => void submit()}
            >
              {action === "deposit"
                ? `Deposit ${inputSymbol}`
                : action === "redeem"
                  ? `Redeem ${symbol}`
                  : "Contribute test yield"}
            </Button>
          ) : (
            <Link to="/connect?next=%2Ftest-tokens" className="mt-5 inline-block font-bold text-ink">
              Connect wallet to use the vault
            </Link>
          )}
          <TransactionError error={tx.error} txId={tx.txId} />
          {tx.phase === "confirmed" && tx.txId && (
            <a
              className="mt-3 inline-block text-[13px] font-bold text-ink"
              href={chain.explorerTxUrl(tx.txId)}
              target="_blank"
              rel="noreferrer"
            >
              Vault action confirmed ↗
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
