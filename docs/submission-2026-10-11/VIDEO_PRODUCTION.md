# Video production packet — 11 October 2026

The current form asks for a working-product demo ≤3 minutes, a separate team/problem/motivation pitch ≤2 minutes, and a CRE execution demo ≤2 minutes. On 11 October the form explicitly accepts “YouTube, Loom, Vimeo, or another video host”; this supersedes the narrower host list recorded in September. The videos can be served from YieldShield's own accessible `/submission-videos` page. Verify each final link in a signed-out browser. Do not submit the application.

## Existing assets

- Supporting product explainer: `apps/monad-web/public/media/how-it-works-20260916-v2.mp4` — 127.87 seconds, H.264/AAC 1920×1080 at 30 fps, about 5.5 MB. It uses current-at-recording app captures and illustrations, with ElevenLabs Chris narration. It does **not** show live wallet signing or introduce the team and must not be relabeled as a new live transaction demo or founder pitch.
- Matching captions/transcript: `.vtt` and `how-it-works-20260916.txt` in that media directory. `docs/VIDEO_TRANSCRIPT.md` describes an older version; use the media `.txt` for the actual current export.
- YieldShield logo: `apps/monad-web/public/favicon.svg` or `docs/design/2026-09-15/assets/yieldshield.svg`. It is a small vector and should be exported cleanly at the needed size, rather than enlarged from a raster thumbnail.
- Existing poster: `apps/monad-web/public/media/how-it-works-20260916.jpg`.
- Available bundled fonts: `apps/monad-web/public/fonts/`; use the app's own typography for restrained captions and labels.

Narration can use the user's authorized ElevenLabs account. Use a stock voice and identify it as synthetic narration; do not imitate David or Santi's voice. The main demo should show actual browser actions and visible results, with narration describing only actions that really occurred. Record complete source footage; trim waits with a visible “confirmation wait shortened” label. Keep wallet credentials, OTPs and unrelated account data out of the crop.

## Main product demo — target 2:45, hard limit 3:00

**Current recording path:** the upstream MON reference price is stale on 11 October and the five reference pools are disabled. Use the working isolated scenario flow below until that outage is repaired and verified. Never dub the scenario as a live MON trade. Today's browser deposit of 1 sMON-demo succeeded at `0xfaa67eac0366b3c21a2fb9c93b238cf55aacfb482c165089af6e165e08532256`.

### Ready-to-narrate scenario version — approximately 1:50–2:15

YieldShield gives a holder two exit choices: keep the remaining asset, or surrender it for an eligible backing payout. This is the working application on Monad testnet. All tokens shown have no monetary value.

For this walkthrough, we use the clearly labeled scenario pool. Its price follows a synthetic cycle, so we can demonstrate gains and losses without presenting a formula as a live market price. The MON reference pools are currently disabled because their upstream price feed is stale.

We connect through Dynamic with an existing MetaMask wallet. After obtaining scenario tokens from the faucet, we select sMON-demo with TestUSDC backing and enter one token. The form shows the pool's backing, fees and waiting period before we sign.

The deposit is confirmed on Monad. Under Positions, we can inspect the receipt and compare the two exits. Withdrawing the asset returns the remaining token after applicable gain-sharing fees. Using backing surrenders that asset, and the payout is limited by the pool's recorded cap and conditions. These are alternatives, not two payments from one receipt.

Backing providers supply the capital and absorb first losses. They earn a share of realized gains. A withdrawal notice only permits available excess backing to be withdrawn; it does not unlock capital reserved for holders.

The status page makes the stale reference feed visible, and dependent actions stay disabled. The public repository includes transaction evidence and our reuse disclosure. YieldShield's protocol foundation predates Metropolis; this application and its Monad integrations are the new milestone.

Show the actual confirmed receipt while saying “deposit is confirmed.” Add an exit-success sentence only after recording a successful exit. This narration contains about 280 words; time the actual audio before export.

### Reference version — only after repaired live verification

Prepare native test MON for gas. Start with a connected test wallet if login cannot be captured cleanly, and state this. Prepare a second mature small holder position only if showing a backing exit; disclose it. Capture the actual current website, readable at 1080p, with modest cursor movement and short holds on receipts.

| Time | Actual screen/action | Narration |
| --- | --- | --- |
| 0:00–0:15 | Home, live URL and testnet identity | “YieldShield gives MON and shMON holders two exit choices: keep the remaining asset, or surrender it for eligible backing. This is the working application on Monad testnet; the assets shown have no monetary value.” |
| 0:15–0:35 | Dynamic/existing MetaMask connection; Faucet wrap | “We connect through Dynamic with an existing MetaMask wallet. On Faucet, we wrap a small amount of test MON. The remaining native MON pays network fees.” |
| 0:35–1:05 | Protect WMON/TestUSDC; amount, terms, wallet approval/deposit; confirmed result | “Here we choose WMON and TestUSDC backing. Before signing, the app shows the amount, available capacity, fees and waiting period. This reference pool shares twelve percent of realized positive gains, not twelve percent of the deposit. We approve the exact amount and confirm the protection deposit.” |
| 1:05–1:35 | Position receipt, reload, restored position | “The confirmed position appears under Positions. Reloading restores the wallet and receipt. We can compare the remaining asset with the eligible backing payout. These are alternative exits: using backing surrenders the remaining asset, and its payout is capped in backing-token units.” |
| 1:35–2:00 | Execute asset exit and show successful closure; optionally second backing exit only if recorded | “For this position, we withdraw the asset and close the receipt. The transaction confirmation and refreshed position state show the result. A backing exit instead requires the displayed wait and gives up the asset.” |
| 2:00–2:25 | Provide and provider terms/position | “Other participants supply the backing. They receive a share of realized gains and absorb first losses. A withdrawal notice only permits withdrawal of unreserved backing; it does not free capital already committed to holders.” |
| 2:25–2:45 | Status, public source/evidence | “Network status exposes contract and price checks. The public repository includes testnet receipts and our reuse disclosure. YieldShield's protocol foundation predates Metropolis; the Monad application, integrations and deployment form this milestone.” |

If an action does not succeed, fix the issue or change the footage/narration; do not retain a success statement over a failed or pending transaction. Sponsor extras should not displace the core signed product journey. Dynamic can reuse the relevant sub-three-minute demo or receive a ≤2-minute excerpt if the optional field is used.

## Pitch — synthetic host version, target 1:35–1:50

Use clear on-screen team names, the real app, two simple exit diagrams and a final validation plan. Label “Synthetic narration; team: David Hawig and Santi.” Do not fabricate headshots, team footage or testimonials. A team-recorded version can adapt these facts into their own words; Santi's unprovided background remains omitted.

**Narration**

Meet YieldShield, built by David Hawig and Santi. David previously served as Director of Ecosystem at Web3 Foundation and founded a startup. The team is starting with MON and shMON holders who want to keep crypto exposure while understanding their choices when prices fall.

Today, those holders can sell some exposure or manage a separate hedge. YieldShield explores another tradeoff. A holder can withdraw the remaining asset, or surrender it for an eligible backing payout. Other participants supply the backing, receive a share of realized gains, and take first-loss risk. The payout has caps and conditions; it is not a cash guarantee.

The team has built a Monad testnet application with wallet onboarding, MON and shMON integrations, and seven funded test pools. Recorded transactions demonstrate holder and provider actions. A separate scenario environment demonstrates the mechanics, while stale reference prices disable dependent actions. The test assets have no monetary value, and the team is not claiming customer adoption or revenue.

YieldShield existed before Metropolis. The protocol foundation is reused and disclosed; the Monad application, asset integrations and deployment are the new milestone, with AI assistance documented publicly.

The next step is to observe six holders and four potential backing providers. Can holders explain the exits? Do providers accept the economics? Do people return? The team wants evidence from both sides before a real-funds launch.

## CRE demo — target 1:35–1:50, hard limit 2:00

Record a real official CLI run in `integrations/chainlink-cre`, using `cre workflow simulate pool-health --target monad-testnet --non-interactive --trigger-index 0`. No `--broadcast`. Show the actual command, successful result, block and report. If login or tooling prevents a new run, the September result may be shown only with its date clearly visible and no claim that it was just executed; the stronger submission is a fresh successful recording.

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:15 | Live app status page, two AUSD pools | “This CRE workflow asks whether YieldShield's public API matches the pool and price state on Monad testnet. It monitors the WMON/AUSD and shMON/AUSD pools.” |
| 0:15–0:35 | Reviewed workflow configuration/source, no credentials | “A cron trigger orchestrates one HTTP snapshot and thirteen EVM reads. The EVM reads use the exact block named by the API, so comparisons do not mix different moments.” |
| 0:35–1:05 | Official CLI command and authentic execution | “We are running the official CRE CLI simulation with live HTTP and Monad EVM capabilities. The workflow checks backing, reservations, paused status and three configured price feeds. This is read-only; it does not move funds or change settlement rules.” |
| 1:05–1:30 | Actual successful result; enlarge block/status/alerts | “The result records the observed block, both pool checks, feed checks and alerts. [Describe the actual result: say healthy and zero alerts only if shown.] Failures such as stale data or an API mismatch are reported rather than replaced by a healthy fallback.” |
| 1:30–1:45 | Evidence/source links | “The source and reproducible command are public. This successful local simulation is the demonstrated deployment level. It is not a continuously running DON workflow or a solvency guarantee.” |

## Deliverables to verify

- Actual durations after titles/credits: technical <180 s, pitch <120 s, CRE <120 s.
- Readable screen contents and captions; no clipped fields or confidential information.
- Narration matches observed receipts and actual CRE output; no invented usage or founder statements.
- Public or unlisted accepted-host links play signed out, with matching titles and no draft placeholders.
- Keep original footage, final files, captions and a short evidence record of recording date, release revision and demonstrated transaction hashes.

## Produced clips

The pitch is 76.9 seconds; the current technical walkthrough is 119.2 seconds and also fits Dynamic's optional two-minute limit. Both are 1920×1080 H.264/AAC and passed complete video-frame/audio-track decoding. The technical clip is labeled **actual browser captures**: it uses authentic screenshots from the executed 11 October flow, with cuts and crops for legibility. It is not a continuous recording of wallet signing. No transaction result or interface was fabricated.

The clips use the final plain-text narrations distributed beside the media, which are shorter than the planning scripts above. Both use the stock ElevenLabs Chris voice and third-person narration for the team. A separate CRE clip remains pending its verified source evidence and narration.
