import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AlphaNotice, LegalLinks } from "@/components/AlphaNotice";
import { Shell, ContentLoading } from "@/layout/Shell";
import { RouteNavigation } from "@/components/RouteNavigation";
import { Spinner } from "@/components/ui";
import { useWalletConnection } from "@/chain/wallet";

// Route-level code splitting: each screen is its own chunk (keeps the initial bundle small;
// recharts/etc. only load when a screen that needs them is visited).
const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[key] as React.ComponentType })));

const HowItWorks = named(() => import("@/screens/HowItWorks"), "HowItWorks");
const TestTokens = named(() => import("@/screens/TestTokens"), "TestTokens");
const Status = named(() => import("@/screens/Status"), "Status");
const Markets = named(() => import("@/screens/Markets"), "Markets");
const Trade = named(() => import("@/screens/Trade"), "Trade");
const Legal = named(() => import("@/screens/Legal"), "Legal");
const Welcome = named(() => import("@/screens/Welcome"), "Welcome");
const Connect = named(() => import("@/screens/Connect"), "Connect");
const Home = named(() => import("@/screens/Home"), "Home");
const PoolDetail = named(() => import("@/screens/PoolDetail"), "PoolDetail");
const Deposit = named(() => import("@/screens/Deposit"), "Deposit");
const PositionDetail = named(() => import("@/screens/PositionDetail"), "PositionDetail");
const Activate = named(() => import("@/screens/Activate"), "Activate");
const Provide = named(() => import("@/screens/Provide"), "Provide");
const CreatePool = named(() => import("@/screens/CreatePool"), "CreatePool");
const Underwriter = named(() => import("@/screens/Underwriter"), "Underwriter");
const Activity = named(() => import("@/screens/Activity"), "Activity");
const Account = named(() => import("@/screens/Account"), "Account");

/**
 * Public protection terms and wallet setup remain accessible independently of market readiness.
 * Only personal portfolio routes require a connected wallet.
 */
export default function App() {
  const { pathname } = useLocation();
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const landing = normalizedPath === "/" || normalizedPath === "/welcome";
  return (
    <div className={landing ? "min-h-dvh" : "app-frame"}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-input focus:bg-white focus:p-3 focus:font-bold focus:text-ink"
      >
        Skip to content
      </a>
      <AlphaNotice />
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          <Route
            path="/welcome"
            element={
              <>
                <RouteNavigation />
                <Welcome />
                <footer className="px-6 py-5">
                  <LegalLinks />
                </footer>
              </>
            }
          />
          <Route element={<Shell />}>
            <Route path="/markets" element={<Markets />} />
            <Route path="/trade" element={<Trade />} />
            <Route path="/status" element={<Status />} />
            <Route path="/test-tokens" element={<TestTokens />} />
            <Route path="/explore" element={<Navigate to="/markets" replace />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            {["legal", "privacy", "terms", "risks"].map((path) => (
              <Route key={path} path={`/${path}`} element={<Legal />} />
            ))}
            <Route path="/connect" element={<Connect />} />
            <Route path="/pool/:poolId" element={<PoolDetail />} />
            <Route path="/provide" element={<Provide />} />
            <Route path="/protect" element={<Navigate to="/provide" replace />} />
            <Route path="/protection/new" element={<Deposit />} />
            <Route path="/deposit" element={<Deposit />} />
            <Route element={<RequireWallet />}>
              <Route path="/positions" element={<Home />} />
              <Route path="/position/:id" element={<PositionDetail />} />
              <Route path="/activate/:id" element={<Activate />} />
              <Route path="/create-pool" element={<CreatePool />} />
              <Route path="/underwriter/:id" element={<Underwriter />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/account" element={<Account />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function RequireWallet() {
  const { pathname, search, hash } = useLocation();
  const { connected, connecting, isReady } = useWalletConnection();
  // Persisted sessions restore ASYNCHRONOUSLY after mount (wagmi reconnectOnMount /
  // framework-kit walletPersistence). Bouncing to Welcome the instant we see "disconnected"
  // logs the user out on every refresh — so give restoration a short settle window first.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(t);
  }, []);

  if (connected) return <Outlet />;
  if (!isReady || connecting || !settled) return <ContentLoading />;
  return <Navigate to={`/connect?next=${encodeURIComponent(pathname + search + hash)}`} replace />;
}

function Splash() {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center">
      <span role="status" aria-label="Loading…">
        <Spinner className="h-7 w-7 text-ink" />
      </span>
    </main>
  );
}
