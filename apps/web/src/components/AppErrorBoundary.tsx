import { Component } from "react";
import type { ReactNode } from "react";
import { Wordmark } from "./Logo";

type RecoveryState = { failed: boolean };

/** Keep recovery outside providers and lazy routes so their failures cannot blank the page. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, RecoveryState> {
  state: RecoveryState = { failed: false };

  static getDerivedStateFromError(): RecoveryState {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    // Use ordinary links here: the router or wallet provider may be the component that failed.
    return (
      <div className="min-h-screen bg-canvas px-5 py-8 text-ink sm:px-8">
        <div className="mx-auto max-w-[680px]">
          <a
            href="/welcome"
            aria-label="YieldShield home"
            className="inline-flex rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0052FF]"
          >
            <Wordmark size={32} />
          </a>
          <main id="main-content" tabIndex={-1} className="mt-12 rounded-card border border-hairline bg-white p-6 sm:p-8">
            <div role="alert">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0052FF]">
                Base Sepolia · Early alpha
              </p>
              <h1 className="mt-4 text-[30px] font-extrabold leading-tight tracking-tight2">
                This page could not load.
              </h1>
              <p className="mt-4 text-[15px] leading-relaxed text-body">
                A page update or an unexpected error may have interrupted this view. Reload the page to try again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-input bg-[#0052FF] px-5 py-3 text-[14px] font-bold text-white hover:bg-[#0047DE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0052FF]"
            >
              Reload page
            </button>
            <p className="mt-4 text-[13px] leading-relaxed text-body">
              Reloading keeps this page’s address, including any stock and amount saved there.
            </p>
            <p className="mt-5 border-t border-hairline pt-5 text-[13px] leading-relaxed text-body">
              If you already confirmed a transaction, check your wallet activity before submitting again. Reloading does
              not cancel a pending transaction.
            </p>
          </main>
          <nav
            aria-label="Recovery help"
            className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-[13px] font-semibold text-[#0052FF]"
          >
            <a href="/status" className="underline underline-offset-4">
              Check service status
            </a>
            <a href="/how-it-works" className="underline underline-offset-4">
              How protection works
            </a>
            <a href="/risks" className="underline underline-offset-4">
              Alpha risks
            </a>
          </nav>
        </div>
      </div>
    );
  }
}
