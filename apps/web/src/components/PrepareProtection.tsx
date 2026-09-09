import { Link, useSearchParams } from "react-router-dom";
import { AmountInput } from "@/components/AmountInput";
import { AssetGlyph, Button, buttonStyles } from "@/components/ui";
import { AvailabilityNotice } from "@/components/AvailabilityNotice";
import { useWalletConnection } from "@/chain/wallet";
import { presetFor } from "@/config/pools";

export function PrepareProtection({ symbol }: { symbol: string }) {
  const [params, setParams] = useSearchParams();
  const { connected } = useWalletConnection();
  const next = `/protection/new?${params.toString()}`;
  const name = presetFor(symbol).asset;
  return (
    <div className="mx-auto max-w-[620px]">
      <Link to="/markets" className="text-[13px] font-bold text-body">
        ← Choose another stock
      </Link>
      <p className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-senior">Prepare your position</p>
      <div className="flex items-center gap-3">
        <AssetGlyph glyph="generic" label={name} symbol={symbol} size={48} />
        <h1 className="page-title">Protect {name}</h1>
      </div>
      <p className="mb-6 mt-3 text-[15px] leading-relaxed text-body">
        This test pool is being prepared. Your selected amount is saved until protection becomes available.
      </p>
      <AmountInput
        accent="senior"
        value={params.get("amount") ?? "5"}
        onChange={(value) => {
          const updated = new URLSearchParams(params);
          updated.set("amount", value);
          setParams(updated, { replace: true });
        }}
        symbol={symbol}
        presets={[1, 5, 10]}
      />
      <p className="mb-6 mt-3 text-[12px] leading-relaxed text-body">
        Your selection is saved in this page’s address. No position is opened or capacity reserved until a deposit is
        confirmed.
      </p>
      <AvailabilityNotice />
      <div className="mt-6 flex flex-col gap-3">
        {connected ? (
          <>
            <Button variant="senior" full onClick={() => window.location.reload()}>
              Check protection availability
            </Button>
            <p className="text-center text-[13px] leading-relaxed text-body">
              If you already have test tokens, keep them in your wallet for when this pool is ready.
            </p>
          </>
        ) : (
          <Link
            to={`/connect?next=${encodeURIComponent(next)}`}
            className={buttonStyles({ variant: "senior", full: true })}
          >
            Connect wallet to prepare
          </Link>
        )}
        <Link
          to={`/test-tokens?next=${encodeURIComponent(next)}`}
          className="py-2 text-center text-[14px] font-bold text-senior"
        >
          {connected ? "Need test tokens?" : "Get free test tokens"}
        </Link>
        <Link to="/how-it-works" className="py-3 text-center text-[14px] font-bold text-body">
          Understand the two ways to exit
        </Link>
      </div>
    </div>
  );
}
