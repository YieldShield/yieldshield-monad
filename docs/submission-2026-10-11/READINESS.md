# Monad hackathon readiness — 11 October 2026

The scenario demonstration is working and has fresh user-confirmed transaction evidence. The application cannot currently offer the five WMON/shMON reference markets: RedStone's upstream testnet MON feed is stale and the existing safety checks correctly disable those actions. These limits are disclosed in the submission draft and videos. This report does not authorize final submission.

| Area | Verified result | Evidence |
| --- | --- | --- |
| Public API | HTTP 200; chain 10143; all 44 registered contract hashes match. Both scenario pools report available actions; five reference pools are disabled. | [Current API snapshot](evidence/api-readiness-20261011.json) |
| Holder browser journey | Deposit 1 sMON-demo; withdraw 0.5 sMON-demo; replace receipt 3 with 4; exit the remaining position for 55.269586 TestUSDC and burn receipt 4. The replacement amount was exactly 0.497352941176392732 sMON-demo. | [Canonical transactions](evidence/browser-transactions-20261011.json) |
| Provider browser journey | Deposit 10 TestUSDC; mint junior receipt 2; start the two-minute notice; withdraw the full available 9.999999 TestUSDC after maturity and burn receipt 2. Canonical state confirms zero remaining balance and shares. The browser updated to no positions without a reload. | [Canonical transactions](evidence/browser-transactions-20261011.json) |
| Chainlink CRE | Current authenticated official CLI simulation exited 0 at block 70157292. Independent same-block reads matched the API and produced two critical unavailable-price alerts. No blockchain writes or DON deployment. | [Result and hashes](evidence/chainlink-cre-simulation-20261011.json), [complete CLI output](evidence/chainlink-cre-simulation-20261011.txt) |
| Media | Captioned product demo (119.2 seconds), team pitch (76.9 seconds) and CRE clip (68.4 seconds) passed complete decode checks and frame inspection. Public metadata loaded for all three; CRE playback advanced to 15.08 seconds with English captions showing. Captures and synthetic narration are disclosed. | [Media production](VIDEO_PRODUCTION.md), [provenance](MEDIA_PROVENANCE.json) |

The six browser transactions are independently checked against canonical receipts, block hashes, pool events, token transfers and receipt-NFT mint/burn events. For the provider position, historical reads show that its 10 TestUSDC deposit converted to shares worth 9.999999 TestUSDC immediately after deposit. The one-base-unit difference is share-conversion rounding; the final withdrawal paid the complete current position amount and left no receipt or withdrawable position balance. The notice matured at 17:20:42 UTC and the withdrawal succeeded at 17:21:08 UTC.

## Code validation

The application fixes cover amount bounds, choosing an available demonstration pool, navigating to the replacement receipt after a partial withdrawal, and refreshing positions after a confirmed transaction. At frontend commit `8870d49`, 137 web tests across 17 files, Node 24 type checking, lint and production build passed. The latest recovery fixes isolate ancillary refresh failures and clear a replacement-receipt marker only when the corresponding position snapshot is published. The build retains the existing large Dynamic wallet-chunk warning. Frontend commit `ef194f7` was promoted to production as Vercel deployment `dpl_HXhWLDmEGoaVwuDqHXbXomrJPd6d`. The parent verification confirmed anonymous HTTP 200 for the videos, captions and evidence links, and checked the available default scenario, minimum-deposit guard and explicit stale-market state in the browser. The application changes are collected in [PR 58](https://github.com/YieldShield/yieldshield-monad/pull/58).

The current dependency gate passed at `ef194f7`: the API and contract-tool production audits were clean. The frontend retains the documented exception for one unpatched upstream `bigint-buffer` advisory (seven inherited package findings), expiring 16 October; the emitted browser bundle does not include its native binding. See [dependency security](../DEPENDENCY_SECURITY.md).

The isolated CRE update passed type checking, official SDK WASM compilation and 18 tests with 82 assertions. Its unavailable-feed path completes with a critical result; network failures and unexpected contract-read failures still abort execution. The current simulation performs 11 EVM reads, with a maximum of 13 when all configured feeds are healthy.

## Portal draft state

The portal's **Save changes** action automatically displays **Ready for judging** when every required field is filled; there is no separate Submit action in the observed flow. A complete save briefly showed that state on 11 October. The pitch-video URL was then removed and the draft saved again to preserve the owner's instruction not to submit yet. Do not describe the application as submitted or all required fields as saved.

The saved draft was verified after reload as **6/7** required fields. The final pitch URL, https://monad.yieldshield.ai/submission-videos.html?video=pitch, is now entered only as an **unsaved** change in the open handoff tab, which shows **7/7** and **Unsaved changes**. It remains absent from the persisted required field. Saving this complete form is the final owner-controlled release step. The product and CRE videos are available on the same public viewing page; the deliberately incomplete saved state does not indicate a missing artifact.

## Remaining limits

- RedStone's last accepted MON update is **23 September 2026, 12:55:42 UTC**. Its current canonical feed and code hash still match the configured source. The official data gateway rejects unauthenticated access. Recovery requires valid provider updates or a separately reviewed integration change; no price or freshness guard was weakened. [Diagnosis](evidence/redstone-diagnosis.json)
- Kuru's pinned contract identities and active-market settings verify, but the current minimum 10-USDC buy quote consumes zero input and returns zero MON. September trade evidence is historical. No current buy-then-protect journey or external demand is claimed. [Live check](evidence/integration-live-check.json)
- Envio remains unconfigured and was removed from bounty selection at the owner's instruction. Its empty response is not presented as a successful event index.
- Email-based embedded-wallet signing and completed external shMON unstaking remain outside the verified evidence. The confirmed browser wallet path uses Dynamic with external MetaMask.
- All demonstrated assets are valueless testnet assets. These internal checks are not customer adoption, real-money TVL, a solvency guarantee or an independent security audit.

The connected wallet's address is omitted from the saved browser evidence. Public transaction hashes remain available for independent verification, and event actors are checked against each transaction's sender.
