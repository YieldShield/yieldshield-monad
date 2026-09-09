export function ExitChoices() {
  return (
    <section aria-labelledby="exit-choices-title">
      <h2 id="exit-choices-title" className="text-center text-[29px] font-semibold tracking-[-0.045em] sm:text-[38px]">
        Your position. Two ways out.
      </h2>
      <svg viewBox="0 0 640 82" fill="none" aria-hidden className="mx-auto mt-5 h-auto w-full max-w-[640px]">
        <path
          d="M320 0V25C320 33 314 39 306 39H168C159 39 152 46 152 55V74M320 25C320 33 326 39 334 39H472C481 39 488 46 488 55V74"
          stroke="#b7b1c4"
          strokeWidth="1.5"
        />
        <path
          d="m146 68 6 7 6-7M482 68l6 7 6-7"
          stroke="#7e7196"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="320" cy="4" r="4" fill="#7855b7" />
      </svg>
      <div className="grid grid-cols-2 gap-5 text-center sm:gap-12">
        <div>
          <h3 className="text-[21px] font-semibold tracking-tight2 sm:text-[26px]">Keep your assets</h3>
          <p className="mx-auto mt-2 max-w-[25ch] text-[15px] leading-relaxed text-body sm:text-[16px]">
            Withdraw your assets, less fees on gains.
          </p>
        </div>
        <div>
          <h3 className="text-[21px] font-semibold tracking-tight2 sm:text-[26px]">Take the backing</h3>
          <p className="mx-auto mt-2 max-w-[26ch] text-[15px] leading-relaxed text-body sm:text-[16px]">
            Surrender assets for backing, within your reserved cap.
          </p>
        </div>
      </div>
      <p className="mt-7 text-center text-[12px] text-body">Waiting periods and contract checks apply.</p>
    </section>
  );
}
