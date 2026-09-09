import trancheArtwork from "@/assets/marketing/tranches-hero.webp";

export function TrancheFlow() {
  return (
    <figure className="relative isolate mx-auto w-full max-w-[820px]">
      <img
        src={trancheArtwork}
        alt="A transparent violet asset layer sits above a solid cobalt collateral reserve."
        width={1536}
        height={1024}
        fetchPriority="high"
        className="block h-auto w-full mix-blend-multiply"
      />
      <figcaption className="absolute inset-0">
        <div className="absolute left-[4%] top-[4%] sm:left-[5%]">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-senior sm:text-[12px]">Senior</p>
          <p className="mt-1 text-[17px] font-semibold tracking-tight2 sm:text-[22px]">Asset exposure</p>
          <div aria-hidden className="mt-2 h-7 w-px bg-[#9c83cd]/60 sm:h-10" />
        </div>
        <div className="absolute bottom-[1%] right-[3%] text-right sm:right-[5%]">
          <div aria-hidden className="mb-2 ml-auto h-7 w-px bg-junior/50 sm:h-9" />
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-junior sm:text-[12px]">Junior</p>
          <p className="mt-1 text-[17px] font-semibold tracking-tight2 sm:text-[22px]">Backing + gain share</p>
        </div>
      </figcaption>
    </figure>
  );
}
