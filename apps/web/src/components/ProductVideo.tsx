import { useRef, useState } from "react";

export function ProductVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  async function play() {
    try {
      await video.current?.play();
      setStarted(true);
    } catch {
      setStarted(true);
    }
  }

  return (
    <figure>
      <div className="relative overflow-hidden rounded-[24px] bg-[#faf9f7] sm:rounded-[32px]">
        <video
          ref={video}
          controls
          playsInline
          preload="none"
          poster="/application-videos/yieldshield-promo-v3-poster.jpg"
          aria-label="YieldShield 40-second overview"
          onPlay={() => setStarted(true)}
          className="block aspect-video w-full object-contain"
        >
          <source src="/application-videos/yieldshield-promo-v3.mp4" type="video/mp4" />
          <track
            kind="captions"
            src="/application-videos/yieldshield-promo-v3.vtt"
            srcLang="en"
            label="English"
          />
          <a href="/application-videos/yieldshield-promo-v3.mp4">Watch the 40-second overview</a>
        </video>
        {!started && (
          <button
            type="button"
            onClick={play}
            aria-label="Play the YieldShield overview"
            className="absolute left-1/2 top-1/2 flex h-[70px] w-[70px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white shadow-xl transition-transform hover:scale-105 sm:h-[84px] sm:w-[84px]"
          >
            <svg width="27" height="30" viewBox="0 0 27 30" fill="currentColor" aria-hidden className="ml-1">
              <path d="M3 2 25 15 3 28Z" />
            </svg>
          </button>
        )}
      </div>
      <figcaption className="mt-3 text-[14px] font-semibold text-body">Watch the 40-second overview</figcaption>
    </figure>
  );
}
