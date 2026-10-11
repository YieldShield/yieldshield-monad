# Submission videos — 11 October 2026

The current form asks for a working-product demo of at most three minutes, a separate team/problem/motivation pitch of at most two minutes, and a CRE execution demo of at most two minutes. On 11 October the form explicitly accepts “YouTube, Loom, Vimeo, or another video host”; this supersedes the narrower host list recorded in September. The application remains a draft and must not be submitted.

## Completed deliverables

| Clip | Duration | Video | Captions | Transcript |
| --- | --- | --- | --- | --- |
| Product walkthrough | 119.2 seconds | [MP4](../../apps/monad-web/public/media/metropolis-technical-20261011.mp4) | [WebVTT](../../apps/monad-web/public/media/metropolis-technical-20261011.vtt) | [Text](../../apps/monad-web/public/media/metropolis-technical-20261011.txt) |
| Team and vision | 76.9 seconds | [MP4](../../apps/monad-web/public/media/metropolis-pitch-20261011.mp4) | [WebVTT](../../apps/monad-web/public/media/metropolis-pitch-20261011.vtt) | [Text](../../apps/monad-web/public/media/metropolis-pitch-20261011.txt) |
| Chainlink CRE simulation | 68.4 seconds | [MP4](../../apps/monad-web/public/media/metropolis-cre-20261011.mp4) | [WebVTT](../../apps/monad-web/public/media/metropolis-cre-20261011.vtt) | [Text](../../apps/monad-web/public/media/metropolis-cre-20261011.txt) |

The product walkthrough also fits Dynamic's optional two-minute limit. Playback pages are `/submission-videos?video=technical`, `/submission-videos?video=pitch` and `/submission-videos?video=cre`. Confirm deployed playback and captions in a signed-out browser before saving the final application links.

All exports are 1920×1080, H.264/AAC, 30 fps. Each passed complete video-frame and audio-track decoding; representative exported frames were inspected. Captions use locally derived word timings aligned to the authoritative final transcripts, with recognition errors corrected from those scripts. The transcripts beside the videos are the exact narrated versions.

## What the footage demonstrates

The product clip is labeled **actual browser captures**. It uses authentic screenshots from the executed 11 October testnet flow, with cuts and crops for legibility. It is not a continuous recording of wallet signing. It shows the scenario deposit, confirmed receipt, partial withdrawal/replacement receipt, provider preview and confirmed 10-TestUSDC provider position. The scenario's synthetic price cycle and current reference-market outage are explicit. No interface, transaction result, production user or testnet liquidity claim was fabricated.

The team pitch uses original typography cards, repository facts and the existing YieldShield brand. David Hawig and Santi are named; no portrait, testimonial or unprovided Santi biography was generated. The proposed six-holder/four-provider cohort is labeled as a plan, not traction. Protocol reuse and AI assistance are disclosed.

The CRE clip combines explanatory cards with an actual browser capture of a faithful, explicitly dated CLI-log excerpt. The official authenticated local simulation completed on 11 October 2026 at 18:19 Europe/Berlin, exit code 0, block 70157292. It returned a **critical** report with two `oracle-price-unavailable` alerts for WMON and shMON. The two configured pools and public API observations agree. Successful execution is not presented as healthy prices. The workflow is read-only and has not been deployed as a continuous DON monitor.

The complete [raw CLI log](evidence/chainlink-cre-simulation-20261011.txt) and [parsed result/hash manifest](evidence/chainlink-cre-simulation-20261011.json) preserve the evidence behind the readable excerpt. Only the long JSON line and generic CLI notices were omitted from that displayed excerpt; no terminal typing was fabricated.

## Sources and production

All narration uses the user's authorized ElevenLabs account, stock **Chris**, **Eleven Multilingual v2**. It is synthetic third-person narration, not a founder voice clone. The [1024-pixel logo](../../apps/monad-web/public/media/metropolis-logo-20261011.png) reproduces the existing `favicon.svg` geometry and colors. Typography is Manrope and DM Sans under the repository's existing font licenses.

[MEDIA_PROVENANCE.json](MEDIA_PROVENANCE.json) records hashes, source screenshots, exact crops, original audio, renderer, export verification and factual boundaries. Original production assets remain in `output/readiness-20261011/`; the source HTML for the recorded CRE excerpt is in `output/cre-demo-20261011/`. Intermediate files are not included in the application release commit.

The older September explainer remains separate supporting material. It must not be relabeled as today's transaction demo or team pitch. These new clips do not imply reference-price recovery, fresh Kuru liquidity, external adoption, real-money TVL or a solvency guarantee.
