import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/PublicHeader";
import { TrancheFlow } from "@/components/TrancheFlow";
import { ExitChoices } from "@/components/ExitChoices";
import { ProtocolBenefits } from "@/components/ProtocolBenefits";

export function Welcome() {
  return (
    <main id="main-content" tabIndex={-1} className="bg-[#faf9f7]">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-9 lg:px-14">
        <PublicHeader />
        <section className="grid items-center gap-5 pb-12 pt-12 lg:min-h-[620px] lg:grid-cols-[0.95fr_1.1fr] lg:gap-0 lg:py-16">
          <div className="relative z-10">
            <p className="mb-7 text-[11px] font-bold uppercase tracking-[0.2em] text-[#82728e]">
              A new way to HODL
            </p>
            <h1 className="text-[55px] font-semibold leading-[0.98] tracking-[-0.055em] sm:text-[76px] lg:text-[86px]">
              Keep your
              <br />
              upside.
              <br />
              <span className="text-[#8a6cb3]">Choose your exit.</span>
            </h1>
            <p className="mt-6 max-w-[30ch] text-[18px] leading-relaxed text-body sm:text-[20px]">
              Hold your assets with a second way out. Choose protection, or provide the backing.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
              <Link
                to="/markets"
                className="inline-flex min-h-[54px] items-center justify-center gap-7 rounded-full bg-ink px-7 text-[14px] font-semibold text-white transition-colors hover:bg-[#604087]"
              >
                Explore assets <span aria-hidden>↗</span>
              </Link>
              <Link
                to="/how-it-works"
                className="py-3 text-[14px] font-semibold underline decoration-[#c5bbcf] underline-offset-4"
              >
                How it works
              </Link>
            </div>
          </div>
          <div className="-mx-4 mt-5 sm:-mx-6 lg:-mr-10 lg:mt-0">
            <TrancheFlow />
          </div>
        </section>
        <div className="border-y border-[#ded9e2]">
          <ProtocolBenefits />
        </div>
        <div className="mx-auto max-w-[820px] py-16 sm:py-20">
          <ExitChoices />
        </div>
      </div>
    </main>
  );
}
