import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "@/components/icons";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { chain } from "@/chain/adapter";
import { friendlyError } from "@/chain/useSubmitTx";
import { useWalletConnection } from "@/chain/wallet";

import { safeNextPath, connectionBackPath } from "@/lib/navigation";

type Brand = { match: string; name: string; sub: string; swatch: string };

// Familiar-wallet shortlist per chain family; anything else discovered lands under "others".
const BRANDS: Brand[] =
  chain.family === "evm"
    ? [
        { match: "metamask", name: "MetaMask", sub: "Most popular wallet", swatch: "bg-wallet-phantom" },
        { match: "rabby", name: "Rabby", sub: "Power-user wallet", swatch: "bg-wallet-backpack" },
        { match: "coinbase", name: "Coinbase Wallet", sub: "Web & mobile", swatch: "bg-wallet-solflare" },
      ]
    : [
        { match: "phantom", name: "Phantom", sub: "Most popular on Solana", swatch: "bg-wallet-phantom" },
        { match: "backpack", name: "Backpack", sub: "xNFT wallet", swatch: "bg-wallet-backpack" },
        { match: "solflare", name: "Solflare", sub: "Web & mobile", swatch: "bg-wallet-solflare" },
      ];

export function Connect() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const { connectors, connect, connecting, connected } = useWalletConnection();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connected) navigate(next, { replace: true });
  }, [connected, navigate, next]);

  const connectorFor = (match: string) => connectors.find((c) => c.name.toLowerCase().includes(match));

  async function onConnect(connectorId: string, key: string) {
    setError(null);
    setBusy(key);
    try {
      await connect(connectorId);
      navigate(next, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  // Known brands first; then any other discovered wallet-standard wallets.
  const knownIds = new Set(BRANDS.map((b) => connectorFor(b.match)?.id).filter(Boolean));
  const others = connectors.filter((c) => !knownIds.has(c.id));

  return (
    <div>
      <div className="mx-auto flex max-w-[460px] flex-col">
        <Link to={connectionBackPath(next)} className="mb-8 flex items-center gap-2 text-body hover:text-ink">
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          Back
        </Link>

        <div className="animate-fade-up">
          <h1 className="page-title">Connect a wallet</h1>
          <p className="mt-2 text-[15px] text-body">
            Choose a wallet to continue.
          </p>

          <p className="mt-4 text-[13px] leading-relaxed text-body">
            Connecting is free. Trades, token requests, deposits and exits each require your approval.
          </p>
          <div className="mt-7 flex flex-col gap-3">
            {BRANDS.map((b) => {
              const c = connectorFor(b.match);
              const disabled = !c || connecting;
              return (
                <WalletButton
                  key={b.match}
                  swatch={b.swatch}
                  name={b.name}
                  sub={c ? b.sub : "Not detected"}
                  busy={busy === b.match}
                  disabled={disabled}
                  onClick={() => c && onConnect(c.id, b.match)}
                />
              );
            })}
            {others.map((c) => (
              <WalletButton
                key={c.id}
                swatch="bg-ink"
                name={c.name}
                sub="Detected"
                busy={busy === c.id}
                disabled={connecting}
                onClick={() => onConnect(c.id, c.id)}
              />
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-4 text-[13px] font-medium text-amber-deep">
              {error}
            </p>
          )}
          {connectors.length === 0 && (
            <p className="mt-4 text-[13px] text-muted">
              No wallet detected in this browser. Install an EVM wallet such as MetaMask, Rabby, or Coinbase Wallet to
              continue.
            </p>
          )}

          <Link to="/markets" className="mt-6 block text-center text-[14px] font-bold text-[#0052FF]">
            Browse assets without a wallet
          </Link>
          <p className="mt-8 text-center text-[13px] text-muted">
            Your keys stay in your wallet.
          </p>
        </div>
      </div>
    </div>
  );
}

function WalletButton({
  swatch,
  name,
  sub,
  busy,
  disabled,
  onClick,
}: {
  swatch: string;
  name: string;
  sub: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3.5 rounded-card border border-hairline bg-surface p-4 text-left transition-colors",
        disabled ? "opacity-55" : "hover:bg-subtle-2",
      )}
    >
      <span className={cn("h-9 w-9 rounded-[10px]", swatch)} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{name}</span>
        <span className="block text-[13px] text-muted">{sub}</span>
      </span>
      {busy ? <Spinner className="text-muted" /> : <ChevronRight className="h-5 w-5 text-faint" />}
    </button>
  );
}
