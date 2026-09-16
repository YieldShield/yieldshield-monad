# Metropolis submission packet — working draft

**Status as recorded on 16 September 2026: seven pools deployed, scripted transaction evidence complete, and the Dynamic external-wallet browser journey verified. Final submission remains pending.** David authorized submission preparation. The existing project draft has been updated with the new repository, and the team is confirmed. The portal was recorded as opening final submissions on 22 September 2026; recheck the current form before submitting. The public narrated overview is ready. Email-based embedded-wallet verification, accepted-host demo videos and final form checks remain outstanding. Source publication was authorized on 16 September; see [the publication record](PUBLICATION.md).

## Entry facts

- Project: **YieldShield on Monad**
- Track: **Onchain Finance & Trading**
- Demo: https://monad.yieldshield.ai
- Video (2:08): https://monad.yieldshield.ai/media/how-it-works-20260916-v2.mp4
- Product guide and captioned player: https://monad.yieldshield.ai/how-it-works
- Source: https://github.com/YieldShield/yieldshield-monad — public. Attribution, license notices and build history are preserved.
- Network: Monad **testnet**, chain 10143.
- Operator: Hawig Ventures UG (haftungsbeschränkt), Herzogin-Juliana-Straße 7, 55469 Simmern, Germany. Managing Director David Hawig. HRB 24975, Amtsgericht Bad Kreuznach.
- Contact: david@yieldshield.ai
- Team: David (@davidhawig) and Santi (@santi), both confirmed as members in the signed-in portal on 14 September. No new invitation needed.
- X: https://x.com/yieldshield_ai
- Prior funding and awards: none, as supplied by David. Prior participation or overlapping-event submissions were not established.

## Short description

YieldShield on Monad gives MON and shMON holders two exit choices backed by separately supplied first-loss capital. The Monad application combines native MON handling, shMON staking, explicit asset and price identities, and wallet transaction checks. Backing providers receive a share of realized gains and accept first-loss exposure.

## Current progress wording

The Monad application now has 44 verified named contracts and seven funded pools on testnet: two isolated scenario markets and five reference markets for WMON and shMON. The original five pools were initially seeded with 50,000 test backing units each; the two new WMON/AUSD and shMON/AUSD pools each received 2,000 official Agora testnet AUSD after a 500-AUSD creation bond. Confirmed transaction journeys cover native wrapping, shMON staking, holder deposits and both exit choices, provider deposits/claims/notices/withdrawals, scenario exchange, and vault deposit/yield/redemption. The expanded AUSD journey adds 20 confirmed transactions covering deposits, both holder exits and provider actions across both new pools. RedStone supplies fresh MON/USD rounds directly on chain; shMON uses conservative withdrawal NAV. Dynamic email and embedded-wallet onboarding is implemented and configured. The external MetaMask path through Dynamic has passed the browser journey; the email-based embedded-wallet path remains unverified.

Evidence: [deployment verification](evidence/deployment-verification.json), [scenario journey](evidence/scenario-journey.json), [reference journey](evidence/reference-journey.json), [expanded AUSD journey](evidence/expanded-journey.json), and [published expansion checks](evidence/expanded-release.json). These are internal test transactions, not adoption or real-money TVL. The reference journal preserves one out-of-gas shMON exit and the separately reviewed successful retry. A later [Dynamic browser check](DYNAMIC_BROWSER_CHECK.md) verified wrapping, protection, wallet/position recovery after reload, and asset withdrawal through an external MetaMask wallet; its three final transaction receipts were independently verified. Embedded-email wallets and completed external shMON unstaking remain unverified.

The searchable asset selectors offer the verified testnet assets and backing tokens. Mainnet syrupUSDC, sUSDe, USDe, earnAUSD, Kintsu sMON, wstETH and weETH are research-catalog entries only; their presence does not establish transaction support or earned yield. USDe alone is not yield-bearing.

## Reuse and AI disclosure

YieldShield predates this event. We reused the existing protocol, accounting, receipt NFTs and immutable-module foundation. The new milestone is the Monad application and deployment, native MON and shMON handling, strict RedStone and historical Pyth reference adapters, independent scenario environment, public status service, wallet checks, searchable asset selection, the verified Agora testnet AUSD expansion and reproducible evidence. The detailed file-level disclosure is in [HACKATHON_DELTA.md](HACKATHON_DELTA.md). OpenAI Codex assisted with code, tests, documentation, debugging and deployment.

## Founder bio

David Hawig previously served as Director of Ecosystem at Web3 Foundation and founded his own startup. He is Managing Director of Hawig Ventures UG (haftungsbeschränkt), building YieldShield with a two-person team. His focus for Metropolis is bringing collateral-backed crypto protection to Monad with understandable fees, backing and exit conditions. He is available full-time throughout the week.

Career details and company data above were provided by David. No employment dates, startup exit, funding history or third-party endorsement is inferred.

## Readiness gates

| Requirement                                            | Current evidence / remaining work                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Public working app                                     | Seven funded markets; the 16 September release check records healthy sources and enabled actions                                              |
| Monad mainnet or testnet deployment                    | 44 named contracts, seven pools and their 14 receipt NFTs verified; all three scripted journey suites complete                         |
| Exact source under an OSI-approved license             | Public repository; MIT new code and retained file-level notices                  |
| Substantial new build-window work and reuse disclosure | Import baseline, separate stage commits and new-work disclosure present; eligibility ultimately assessed by organizers |
| Setup and technical documentation                      | README, architecture, operations and evidence files present                                                            |
| Technical demo ≤3 minutes on YouTube, Loom or Vimeo     | Existing 2:08 self-hosted walkthrough is supporting material; record the live working wallet flow and upload to an accepted host |
| Founder pitch ≤2 minutes                              | David and Santi will record it; [speaking guide](FOUNDER_PITCH_GUIDE.md) prepared |
| Project graphic and judge access instructions         | Confirm JPG/JPEG/PNG/WEBP graphic ≤3 MB and clear testnet/faucet instructions in the final form |
| Fresh external MON pricing                             | RedStone MON/USD read directly on chain; no paid API subscription needed                                               |
| Team profile                                           | David and Santi confirmed in the portal                                                                                |
| Honest usage/traction                                  | No external user adoption, non-demo TVL, revenue or independent audit claimed                                          |
| Final submission                                       | Authorized, but the final form opens 22 September; retain a confirmation when actually submitted                       |

## Timing and rules source

The signed-in Metropolis Rules & Guidelines v3.0 (updated 3 September 2026), recorded on 8 September, require public GitHub source, an OSI-approved license, setup/build history, attribution and AI disclosure. They accept Monad mainnet or testnet and require a public product video no longer than three minutes. The public FAQ says open source is encouraged rather than mandatory. The authenticated onboarding route now redirects to the dashboard, so the discrepancy remains unresolved. The owner subsequently authorized public release on 16 September. Recheck the operative final form when it opens.

Recorded deadline: **13 October 2026, 23:59 ET**, equivalent to **14 October 2026, 05:59 CEST**. Internal target: **12 October, 18:00 Europe/Berlin**. The project workspace showed submissions opening on 22 September. The build window itself began 1 September, as the [Monad Foundation's event listing](https://luma.com/metropolis-hangzhou-sep-2026) confirms.

Before final submission, inspect the current [project workspace](https://hackathon.monad.xyz/project) and [registration rules](https://hackathon.monad.xyz/onboarding), confirm the saved new repository link, verify signed-out access to all artifacts, and retain the submission confirmation. Dynamic, Kuru, Envio and CRE are selected for preparation. Dynamic browser execution, scripted Kuru funding and successful official CRE simulation have evidence; Envio awaits free-token activation. See the [sponsor release](SPONSOR_RELEASE_2026-09-16.md). Internal tests and selection alone do not establish bounty qualification.

### Portal preparation on 16 September

The signed-in [finance track](https://hackathon.monad.xyz/tracks/onchain-finance) now explicitly lists a live technical demo of at most three minutes on YouTube, Loom or Vimeo, a separate founder pitch of at most two minutes, a public GitHub repository, a graphic of at most 3 MB, and a working Monad mainnet or testnet link with judge access instructions. A promotional clip is optional and does not affect judging. These observed requirements supersede the older video-only checklist above; recheck final fields when they open.

The project description was refreshed to the public repository and seven-pool deployment. Two substantive private progress updates were posted with the owner's authorization: the working Monad milestone/reuse disclosure and the deployed AUSD expansion. Dynamic, Envio and Chainlink CRE were added as intended sponsor bounty selections; selection is not a claim of completed qualification. Kuru still needs executable integration and usage evidence. The Updates page says one update unlocks mentors while the Mentors page says three; verify actual access rather than treating either count as a final submission requirement.

The [market readiness packet](MARKET_READINESS_2026-09-16.md) defines six holder and four provider research sessions. Those sessions and their proposed targets are not completed traction. David and Santi will record the founder pitch themselves. Envio must remain on its free package, with no paid subscription or overages.

Sponsor priorities and the evidence required for each candidate are recorded in [SPONSOR_STRATEGY.md](SPONSOR_STRATEGY.md). Dynamic is the first implemented sponsor integration. Kuru needs actual orderbook execution and usage evidence; Agora testnet AUSD is now implemented and exercised in two pools, but its mobile-trading bounty remains deferred because it mandates Mera, AUSD and Perpl together. AUSD support alone does not satisfy that bounty. The signed-in Dynamic, Kuru, Agora and CRE requirements were reviewed on 14 September. Keep proposed integrations out of completed-work claims until configured and exercised.

The owner’s explicit instruction to publish on 16 September 2026 supersedes the 9 September private-repository decision. The discrepancy in recorded rules still needs a final-form check; publication alone does not establish eligibility or submit the project.

### Follow-up after the sponsor release

A third private progress update reported the verified Dynamic browser journey, scripted Kuru funding and successful official CRE simulation. All three posts are preserved in [the update record](PROGRESS_UPDATES_2026-09-16.md). Mentor-question access is now confirmed: the composer opened normally after the third post, and was cancelled without sending a question. Kuru was added as the fourth intended sponsor bounty. Final submission remains closed until 22 September; videos, external validation and the remaining sponsor evidence must still be completed.
