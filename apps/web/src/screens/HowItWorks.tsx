import { Link } from "react-router-dom";
import { ExitChoices } from "@/components/ExitChoices";
import { ProtocolBenefits } from "@/components/ProtocolBenefits";
import { ProductVideo } from "@/components/ProductVideo";

export function HowItWorks() {
  return (
    <div className="mx-auto max-w-[840px] pb-5">
      <header className="pb-8 pt-3 sm:pb-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#82728e]">The idea</p>
        <h1 className="mt-5 text-[46px] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[66px]">
          Two sides.
          <br />
          <span className="text-[#0052FF]">One shared pool.</span>
        </h1>
        <p className="mt-5 max-w-[43ch] text-[18px] leading-relaxed text-body">
          Senior holders keep upside. Junior capital backs the exit and shares in gains.
        </p>
      </header>

      <ProductVideo />
      <div className="mt-6 grid grid-cols-2 gap-5 px-1 sm:px-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-senior">Senior</p>
          <p className="mt-1 text-[20px] font-semibold">Asset exposure</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-junior">Junior</p>
          <p className="mt-1 text-[20px] font-semibold">First-loss backing</p>
        </div>
      </div>
      <p className="mt-5 px-1 text-[14px] text-body sm:px-5">
        Senior backing stays reserved. Junior capital takes first-loss exposure.
      </p>

      <div className="py-14 sm:py-16">
        <ExitChoices />
      </div>
      <div className="border-y border-[#ded9e2]">
        <ProtocolBenefits />
      </div>

      <div className="mt-7 divide-y divide-[#ded9e2]">
        <details className="group py-5">
          <summary className="cursor-pointer text-[17px] font-semibold">Fees & timing</summary>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-body">
            <p>
              Protection uses gain sharing instead of an upfront premium. Creators choose each pool’s junior gain share
              and creator fee. Example: 10% for junior providers + 1% creator fee + 1% protocol fee = 12% of newly
              accrued positive gains. This is one pool’s terms, not a universal rate. Trading and
              network fees are separate. Fees already deducted are not refunded after a later drawdown.
            </p>
            <p>
              Senior positions have a minimum protected-exit delay and no fixed expiry. Junior withdrawals require
              notice and are limited to excess backing. Each position shows its exact terms.
            </p>
          </div>
        </details>
        <details className="group py-5">
          <summary className="cursor-pointer text-[17px] font-semibold">How the backing works</summary>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-body">
            <p>
              Senior holders have a contractual claim on reserved collateral. Junior providers cannot withdraw that
              committed backing while senior positions remain open. A protected exit surrenders the entire position for
              its entry-value-equivalent backing, capped at the original reserve. Surrendered assets become claimable on
              the junior side.
            </p>
            <p>
              Example: a $100 position with 150 TestUSDC of backing falls to $80. A protected exit pays the senior
              holder 100 TestUSDC. Junior capital retains 50 TestUSDC plus the surrendered assets worth $80: $130
              combined, a $20 economic loss. This illustration assumes TestUSDC is valued at $1, no fees or earlier
              claims, and valid execution.
            </p>
            <p>
              Creators also choose a collateral ratio within the supported limits; 150% is an example. Capital efficiency
              depends on reserve requirements, fees and usage. Each pool funds its own commitments.
            </p>
          </div>
        </details>
        <details className="group py-5">
          <summary className="cursor-pointer text-[17px] font-semibold">Access, assets & risks</summary>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-body">
            <p>
              Contracts are accessible around the clock. Execution still depends on valid prices, backing, available
              contracts and network conditions. Exits require your wallet approval and do not happen automatically.
            </p>
            <p>
              Each market lists the supported asset, backing and quote source. Demo prices follow synthetic scenarios.
              The contracts are unaudited; contract, oracle, token and governance failures can prevent an action.{" "}
              <Link to="/risks" className="underline underline-offset-4">
                Read the risks
              </Link>{" "}
              or{" "}
              <Link to="/status" className="underline underline-offset-4">
                check current status
              </Link>
              .
            </p>
          </div>
        </details>
        <details className="group py-5">
          <summary className="cursor-pointer text-[17px] font-semibold">Compared with options & insurance</summary>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-body">
            <p>
              A purchased protective put has a premium, strike and expiry. YieldShield’s current senior position uses
              gain sharing and has no fixed expiry to roll. The better fit depends on costs, exposure and risk.{" "}
              <a
                href="https://www.optionseducation.org/optionsoverview/options-basics"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                Options Industry Council reference
              </a>
              .
            </p>
            <p>
              A valid exit settles through contract checks without a separate claim assessor. Conventional covered-loss
              assessment works differently; parametric insurance can also use predefined triggers. YieldShield’s
              mechanics do not constitute an insurance policy.{" "}
              <a
                href="https://content.naic.org/insurance-topics/parametric-disaster-insurance"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                NAIC reference
              </a>
              .
            </p>
          </div>
        </details>
      </div>
      <div className="mt-9 flex flex-wrap items-center gap-6">
        <Link
          to="/markets"
          className="inline-flex min-h-[52px] items-center gap-7 rounded-full bg-ink px-7 text-[14px] font-semibold text-white hover:bg-[#604087]"
        >
          Explore assets <span aria-hidden>↗</span>
        </Link>
        <Link
          to="/provide"
          className="py-3 text-[14px] font-semibold text-junior underline decoration-junior/30 underline-offset-4"
        >
          Provide collateral
        </Link>
      </div>
    </div>
  );
}
