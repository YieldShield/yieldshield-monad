import { Link, useLocation } from "react-router-dom";
import { Wordmark } from "@/components/Logo";
import { shortAddress, useWalletConnection } from "@/chain/wallet";

export function PublicHeader() {
  const { connected, address } = useWalletConnection();
  const { pathname, search } = useLocation();
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 py-6">
      <Link to="/welcome" aria-label="YieldShield home">
        <Wordmark size={32} />
      </Link>
      <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-4 text-[13px] font-bold md:gap-6">
        <Link to="/trade" className="hover:text-ink">
          Trade
        </Link>
        <Link to="/markets" className="text-body hover:text-ink">
          Protect
        </Link>
        <Link to="/how-it-works" className="hidden hover:text-ink sm:block">
          How it works
        </Link>
        <Link
          to={
            connected
              ? "/positions"
              : `/connect?next=${encodeURIComponent(pathname === "/welcome" ? "/markets" : pathname + search)}`
          }
          className="rounded-input bg-ink px-4 py-3 text-white hover:bg-ink/90"
        >
          {connected && address ? shortAddress(address) : "Connect wallet"}
        </Link>
      </nav>
    </header>
  );
}
