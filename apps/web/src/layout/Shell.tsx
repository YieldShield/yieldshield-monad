import { Suspense } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Wordmark } from "@/components/Logo";
import { AccountIcon, ExploreIcon, HomeIcon, ShieldIcon, SwapIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { shortAddress, useWalletConnection } from "@/chain/wallet";
import { LegalLinks } from "@/components/AlphaNotice";
import { PRIMARY_NAVIGATION, UTILITY_NAVIGATION } from "@/lib/site-navigation";

import { RouteNavigation } from "@/components/RouteNavigation";
import { Spinner } from "@/components/ui";
import { getNavigationSection, setupLink } from "@/lib/navigation";

const ICONS = {
  trade: SwapIcon,
  protection: ExploreIcon,
  positions: HomeIcon,
  collateral: ShieldIcon,
  account: AccountIcon,
};

export function Shell() {
  return (
    <div className="flex min-h-0 min-w-0">
      <Sidebar />
      <div id="app-scroll" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <MobileHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[760px] px-4 pb-6 pt-5 sm:px-6 lg:max-w-[1040px] lg:px-10 lg:pb-12 lg:pt-10"
        >
          <Suspense fallback={<ContentLoading />}>
            <RouteNavigation />
            <Outlet />
          </Suspense>
        </main>
        <footer className="mx-auto mt-10 max-w-[760px] space-y-5 px-4 pb-[calc(var(--mobile-nav-height)+1.5rem)] lg:hidden">
          <UtilityLinks />
          <LegalLinks />
        </footer>
      </div>
      <BottomTabs />
    </div>
  );
}

function Sidebar() {
  const { pathname, search, hash } = useLocation();
  const activeSection = getNavigationSection(pathname, search);
  const { walletName, address } = useWalletConnection();
  return (
    <aside
      aria-label="Sidebar"
      className="hidden h-full min-h-0 w-[248px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-hairline bg-surface px-5 py-6 lg:flex"
    >
      <Link to="/welcome" aria-label="YieldShield home" className="mb-8 shrink-0">
        <Wordmark />
      </Link>
      <nav aria-label="Main navigation" className="flex shrink-0 flex-col gap-1">
        {PRIMARY_NAVIGATION.map(({ id, to, label }) => {
          const Icon = ICONS[id];
          return (
            <Link
              key={to}
              to={to}
              aria-current={activeSection === id ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-input px-3.5 py-2.5 text-[14.5px] font-semibold transition-colors",
                activeSection === id ? "bg-ink text-white" : "text-body hover:bg-subtle-2",
              )}
            >
              <Icon aria-hidden="true" className="h-[21px] w-[21px]" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex shrink-0 flex-col gap-4 pt-8">
        <UtilityLinks />
        <LegalLinks />
        <Link
          to={address ? "/account" : setupLink("/connect", pathname, search, hash)}
          className="flex items-center gap-2.5 rounded-input border border-hairline px-3.5 py-2.5 text-left hover:bg-subtle-2"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-subtle-2 text-body"
          >
            <AccountIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-ink">{walletName ?? "Connect wallet"}</span>
            {address && <span className="block truncate text-[12px] text-muted tnum">{shortAddress(address)}</span>}
          </span>
        </Link>
      </div>
    </aside>
  );
}

function UtilityLinks() {
  const { pathname, search, hash } = useLocation();
  return (
    <nav aria-label="Tools and status" className="flex flex-col gap-2">
      {UTILITY_NAVIGATION.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to === "/test-tokens" ? setupLink("/test-tokens", pathname, search, hash) : to}
          className={({ isActive }) =>
            cn(
              "rounded-input border px-3.5 py-3 text-[13px] font-semibold transition-colors",
              isActive ? "border-ink bg-ink text-white" : "border-hairline text-body hover:bg-subtle-2",
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function HealthCard() {
  return (
    <Link
      to="/status"
      className="rounded-input border border-hairline px-3.5 py-3 text-[13px] font-semibold text-body hover:bg-subtle-2"
    >
      Market & oracle status
    </Link>
  );
}

function BottomTabs() {
  const { pathname, search } = useLocation();
  const activeSection = getNavigationSection(pathname, search);
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-hairline bg-white/[0.96] backdrop-blur-[18px] lg:hidden"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      {PRIMARY_NAVIGATION.map(({ id, to, mobileLabel }) => {
        const Icon = ICONS[id];
        return (
          <Link
            key={to}
            to={to}
            aria-current={activeSection === id ? "page" : undefined}
            className={cn(
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-2 text-[11px] font-semibold",
              activeSection === id ? "text-ink" : "text-body",
            )}
          >
            <Icon aria-hidden="true" className="h-[22px] w-[22px]" />
            {mobileLabel}
          </Link>
        );
      })}
    </nav>
  );
}

export function ContentLoading() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center">
      <span role="status" aria-label="Loading…">
        <Spinner className="h-7 w-7 text-ink" />
      </span>
    </div>
  );
}

function MobileHeader() {
  const { pathname, search, hash } = useLocation();
  const { address } = useWalletConnection();
  return (
    <header className="mx-auto flex max-w-[760px] items-center justify-between gap-3 px-4 py-5 sm:px-6 lg:hidden">
      <Link to="/welcome" aria-label="YieldShield home" className="shrink-0">
        <Wordmark size={24} />
      </Link>
      <Link
        to={address ? "/account" : setupLink("/connect", pathname, search, hash)}
        aria-label={address ? "Your account" : "Connect wallet"}
        className="inline-flex min-h-11 min-w-0 max-w-[100px] items-center justify-center rounded-input bg-ink px-3 text-[13px] font-bold text-white hover:bg-ink/90"
      >
        <span className="truncate">{address ? shortAddress(address, 4, 3) : "Connect"}</span>
      </Link>
    </header>
  );
}
