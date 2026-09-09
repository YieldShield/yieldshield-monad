import { useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { AssetGlyph, Button, buttonStyles, Card, Pill, Spinner } from "@/components/ui";
import { DemoVaults } from "@/components/DemoVaults";
import { chain } from "@/chain/adapter";
import { useFaucet } from "@/chain/faucet";
import { shortAddress, useWalletConnection } from "@/chain/wallet";
import { useWhitelistedBalances } from "@/data/balances";
import { useProtectionStatus } from "@/data/protection-status";
import { formatAmount } from "@/lib/format";
import { safeNextPath, getNavigationSection } from "@/lib/navigation";
import { faucetAction, faucetTokenLabel, TEST_ETH_FAUCET_URL } from "@/lib/testnet";

export function TestTokens() {
  const { address, walletName } = useWalletConnection();
  const faucet = useFaucet();
  const availability = useProtectionStatus();
  const balances = useWhitelistedBalances();
  const location = useLocation();
  const [params] = useSearchParams();
  const returnTo = safeNextPath(params.get("next"));
  const returningToTrade = getNavigationSection(returnTo) === "trade";
  const connectTo = `/connect?next=${encodeURIComponent(location.pathname + location.search)}`;
  const now = Math.floor(availability.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ recipient: string; txId?: string } | null>(null);
  const inFlight = useRef(false);
  const currentWallet = useRef(address);
  currentWallet.current = address;
  const currentFaucet = useRef(faucet.address);
  currentFaucet.current = faucet.address;
  const walletStatus = useSWR(
    address && faucet.enabled && faucet.address && faucet.status
      ? ["test-token-eligibility", faucet.address, address]
      : null,
    () => faucet.status!(address!),
    { refreshInterval: 15000, revalidateOnFocus: true },
  );
  const action = faucetAction({
    recipient: address,
    enabled: faucet.enabled,
    address: faucet.address,
    publicStatus: availability.data?.faucet,
    publicFresh: availability.fresh,
    wallet: walletStatus.error ? undefined : walletStatus.data,
    now,
  });
  const sent = confirmed?.recipient === address ? confirmed : null;
  const inventory = availability.data?.faucet.tokens ?? [];

  async function refreshChecks() {
    await Promise.allSettled([availability.refresh(), walletStatus.mutate()]);
    balances.refresh();
  }
  async function requestTokens() {
    if (inFlight.current || !address || !faucet.status || !action.canRequest) return;
    const recipient = address,
      target = faucet.address;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setConfirmed(null);
    try {
      const [publicStatus, personal] = await Promise.all([availability.refresh(), faucet.status(recipient)]);
      const checkedAt = Math.floor(Date.now() / 1000);
      const checked = faucetAction({
        recipient,
        enabled: faucet.enabled,
        address: target,
        publicStatus: publicStatus?.faucet,
        publicFresh: !!publicStatus && publicStatus.evaluatedAt <= checkedAt && publicStatus.validUntil > checkedAt,
        wallet: personal,
        now: checkedAt,
      });
      await walletStatus.mutate(personal, { revalidate: false });
      if (!checked.canRequest) throw new Error(checked.description);
      if (currentWallet.current !== recipient || currentFaucet.current !== target)
        throw new Error("Your wallet changed. Review the request again.");
      const result = await faucet.drip(recipient);
      if (!result.ok) throw new Error(result.error ?? "The token request could not be completed.");
      setConfirmed({ recipient, txId: result.txId });
      await refreshChecks();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The token request could not be completed. Refresh and try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
    } catch {
      setError("Copy the wallet address shown below into the test ETH faucet.");
    }
  }

  return (
    <div>
      <div>
        <Link to={returnTo} className="text-[13px] font-semibold text-muted hover:text-ink">
          {returningToTrade ? "← Back to trade" : "← Back"}
        </Link>
        <div className="mb-7 mt-5 max-w-[650px]">
          <Pill tone="neutral">Base Sepolia · Free test tokens</Pill>
          <h1 className="page-title mt-4">
            Try trading and protection.
            <br />
            Start with free tokens.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-body">
            Get test ETH for network fees, then request stocks, crypto and vault shares for your next trade or position.
          </p>
        </div>
        <div className="grid items-start gap-5 md:grid-cols-[1fr_1.05fr]">
          <div className="space-y-4">
            <Card>
              <div className="flex items-start gap-3">
                <StepNumber number="1" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[18px] font-bold tracking-tight2">Connect your wallet</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-body">
                    Use the same wallet here and at the test ETH faucet. Connecting does not request tokens or submit a
                    transaction.
                  </p>
                  {address ? (
                    <>
                      <div className="mt-4 text-[13px] font-semibold text-ink">
                        {walletName ?? "Wallet"} · {shortAddress(address, 6, 4)}
                      </div>
                      <div className="mt-1 break-all text-[11px] text-muted">{address}</div>
                      <Button variant="secondary" className="mt-3 text-[13px]" onClick={() => void copyAddress()}>
                        {copiedAddress === address ? "Address copied" : "Copy wallet address"}
                      </Button>
                    </>
                  ) : (
                    <Link to={connectTo} className={buttonStyles({ variant: "primary", className: "mt-4" })}>
                      Connect wallet
                    </Link>
                  )}
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-start gap-3">
                <StepNumber number="2" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[18px] font-bold tracking-tight2">Get free test ETH</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-body">
                    Open Coinbase’s faucet, choose <strong>Base Sepolia</strong> and <strong>ETH</strong>, then enter
                    your wallet address. A Coinbase Developer Platform account may be required.
                  </p>
                  <a
                    href={TEST_ETH_FAUCET_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex min-h-12 items-center rounded-input border border-hairline-2 px-4 text-[13px] font-bold text-ink hover:bg-subtle"
                  >
                    Open Coinbase test ETH faucet ↗
                  </a>
                  {walletStatus.data && (
                    <p className="mt-3 text-[12px] text-muted">
                      Last checked: {formatAmount(walletStatus.data.nativeBalance, 18, 18)} test ETH in this wallet.
                    </p>
                  )}
                  <p className="mt-3 text-[12px] leading-relaxed text-muted">
                    Keep test ETH for network fees. Request YieldShield’s stock tokens and TestUSDC in step 3; other
                    faucets’ USDC is a different test token.
                  </p>
                </div>
              </div>
            </Card>
          </div>
          <Card className="border-hairline">
            <div className="flex items-center gap-3">
              <StepNumber number="3" />
              <h2 className="text-[20px] font-bold tracking-tight2">Get your test tokens</h2>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-body">
              One request collects the tokens currently available to your wallet. Each token has its own 24-hour
              cooldown.
            </p>
            <div className="my-5 divide-y divide-hairline border-y border-hairline">
              {inventory.length ? (
                inventory.map((token) => {
                  const personal =
                    walletStatus.data &&
                    walletStatus.data.recipient.toLowerCase() === address?.toLowerCase() &&
                    walletStatus.data.address.toLowerCase() === faucet.address?.toLowerCase() &&
                    walletStatus.data.chainId === 84532 &&
                    walletStatus.data.evaluatedAt <= now &&
                    walletStatus.data.validUntil > now &&
                    !walletStatus.error
                      ? walletStatus.data.tokens.find(
                          (item) => item.address.toLowerCase() === token.address.toLowerCase(),
                        )
                      : undefined;
                  const balance = balances.balances.find(
                    (item) => item.token.token.toLowerCase() === token.address.toLowerCase(),
                  );
                  const state = faucetTokenLabel({
                    verifiedFresh: availability.fresh && availability.data?.faucet.verified === true,
                    enabled: token.enabled,
                    funded: token.funded,
                    connected: !!address,
                    personal,
                    now,
                  });
                  return (
                    <div key={token.address} className="flex items-center justify-between gap-3 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <AssetGlyph
                          glyph={token.symbol === "TestUSDC" ? "usdc" : "generic"}
                          label={token.symbol}
                          symbol={token.symbol}
                          size={36}
                        />
                        <div className="min-w-0">
                          <div className="text-[14px] font-bold text-ink">{token.symbol}</div>
                          <div className="mt-0.5 text-[11px] text-muted">{state}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-semibold tnum">
                          {token.enabled && token.dripAmountBaseUnits !== null
                            ? formatAmount(BigInt(token.dripAmountBaseUnits), token.decimals)
                            : "—"}
                        </div>
                        {balance && !balances.error && (
                          <div className="mt-0.5 text-[11px] text-muted">
                            In wallet: {formatAmount(balance.amount, balance.token.decimals)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-4 text-[13px] leading-relaxed text-muted">
                  The available starter basket appears after a fresh inventory check.
                </p>
              )}
            </div>
            <div role="status" aria-live="polite">
              <h3 className="text-[14px] font-bold text-ink">{sent ? "Token request confirmed" : action.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-body">
                {sent
                  ? "Your eligible test tokens were requested. Check the balances above before continuing."
                  : action.description}
              </p>
              {action.nextClaimAt && (
                <p className="mt-2 text-[12px] font-semibold text-body">
                  Next claim:{" "}
                  {new Date(action.nextClaimAt * 1000).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  (your local time)
                </p>
              )}
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-input bg-amber-tint p-3 text-[13px] leading-relaxed text-amber-deep"
              >
                {error}
              </p>
            )}
            {sent?.txId && (
              <a
                href={chain.explorerTxUrl(sent.txId)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-[12px] font-semibold text-ink underline"
              >
                View confirmed transaction ↗
              </a>
            )}
            {address ? (
              <Button
                variant="primary"
                full
                className="mt-5"
                disabled={busy || !action.canRequest}
                onClick={() => void requestTokens()}
              >
                {busy ? (
                  <>
                    <Spinner />
                    Confirming request…
                  </>
                ) : (
                  "Get available test tokens"
                )}
              </Button>
            ) : (
              <Link to={connectTo} className={buttonStyles({ variant: "primary", full: true, className: "mt-5" })}>
                Connect wallet to continue
              </Link>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={busy || availability.loading || walletStatus.isLoading}
                onClick={() => void refreshChecks()}
                className="min-h-11 text-[12px] font-semibold text-muted hover:text-ink disabled:opacity-50"
              >
                Refresh availability
              </button>
              <Link to="/status" className="inline-flex min-h-11 items-center text-[12px] font-semibold text-ink">
                View status
              </Link>
            </div>
            <Link
              to={returnTo}
              className="mt-3 flex min-h-11 items-center justify-center rounded-input bg-subtle-2 px-4 text-[13px] font-bold text-ink hover:bg-hairline"
            >
              {returningToTrade ? "Continue trading" : "Continue"}
            </Link>
            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              A request needs your wallet confirmation and a small test ETH network fee. Token claims do not buy stocks
              or open a protection position. Each trade and deposit is a separate action.
            </p>
          </Card>
        </div>
      </div>
      <div id="yield-vaults">
        <DemoVaults />
      </div>
    </div>
  );
}
function StepNumber({ number }: { number: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle-2 text-[13px] font-bold text-ink"
    >
      {number}
    </span>
  );
}
