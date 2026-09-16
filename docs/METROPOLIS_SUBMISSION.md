# Metropolis submission packet — working draft

**Status: implementation and transaction evidence complete; final submission is not open yet.** David authorized submission preparation. The existing project draft has been updated with the new repository, and the team is confirmed. The portal opens final submissions on 22 September 2026. The public narrated overview is ready. Dynamic browser signing, final form checks and the source-visibility decision remain outstanding.

## Entry facts

- Project: **YieldShield on Monad**
- Track: **Onchain Finance & Trading**
- Demo: https://monad.yieldshield.ai
- Video (2:34): https://monad.yieldshield.ai/media/metropolis-overview.mp4
- Product guide and captioned player: https://monad.yieldshield.ai/how-it-works
- Source: https://github.com/YieldShield/yieldshield-monad — private by owner instruction; resolve the rules discrepancy below before final submission.
- Network: Monad **testnet**, chain 10143.
- Operator: Hawig Ventures UG (haftungsbeschränkt), Herzogin-Juliana-Straße 7, 55469 Simmern, Germany. Managing Director David Hawig. HRB 24975, Amtsgericht Bad Kreuznach.
- Contact: david@yieldshield.ai
- Team: David (@davidhawig) and Santi (@santi), both confirmed as members in the signed-in portal on 14 September. No new invitation needed.
- X: https://x.com/yieldshield_ai
- Prior funding and awards: none, as supplied by David. Prior participation or overlapping-event submissions were not established.

## Short description

YieldShield on Monad gives crypto holders two exit choices backed by separately supplied first-loss capital. The Monad application combines native MON handling, a shMON staking integration, explicit asset and price identities, wallet transaction checks, and a separate scenario lab that explains gains, losses and backing payouts.

## Current progress wording

The Monad application now has 39 verified named contracts and five funded pools on testnet: two isolated scenario markets and three reference markets for WMON and shMON. Each pool was initially seeded with 50,000 test backing units. Confirmed transaction journeys cover native wrapping, shMON staking, holder deposits and both exit choices, provider deposits/claims/notices/withdrawals, scenario exchange, and vault deposit/yield/redemption. RedStone supplies fresh MON/USD rounds directly on chain; shMON uses conservative withdrawal NAV. Dynamic email and embedded-wallet onboarding is implemented and configured; its separate browser signing evidence is still being completed.

Evidence: [deployment verification](evidence/deployment-verification.json), [scenario journey](evidence/scenario-journey.json), [reference journey](evidence/reference-journey.json). These are internal test transactions, not adoption or real-money TVL. The reference journal preserves one out-of-gas shMON exit and the separately reviewed successful retry. Scripted transaction evidence does not by itself establish a completed browser-wallet demo.

## Reuse and AI disclosure

YieldShield predates this event. We reused the existing protocol, accounting, receipt NFTs and immutable-module foundation. The new milestone is the Monad application and deployment, native MON and shMON handling, strict RedStone and historical Pyth reference adapters, independent scenario environment, public status service, wallet checks and reproducible evidence. The detailed file-level disclosure is in [HACKATHON_DELTA.md](HACKATHON_DELTA.md). OpenAI Codex assisted with code, tests, documentation, debugging and deployment.

## Founder bio

David Hawig previously served as Director of Ecosystem at Web3 Foundation and founded his own startup. He is Managing Director of Hawig Ventures UG (haftungsbeschränkt), building YieldShield with a two-person team. His focus for Metropolis is bringing collateral-backed crypto protection to Monad with understandable fees, backing and exit conditions. He is available full-time throughout the week.

Career details and company data above were provided by David. No employment dates, startup exit, funding history or third-party endorsement is inferred.

## Readiness gates

| Requirement                                            | Current evidence / remaining work                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Public working app                                     | Five funded markets; live API reports healthy sources and enabled actions                                              |
| Monad mainnet or testnet deployment                    | 39 named contracts plus five pools and ten receipt NFTs verified; both journey suites complete                         |
| Exact source under an OSI-approved license             | MIT new code and retained file-level notices; repository publication requires explicit owner approval                  |
| Substantial new build-window work and reuse disclosure | Import baseline, separate stage commits and new-work disclosure present; eligibility ultimately assessed by organizers |
| Setup and technical documentation                      | README, architecture, operations and evidence files present                                                            |
| Public video ≤3 minutes                                | 2:34 narrated screenshot overview with English captions and transcript at /how-it-works                                |
| Fresh external MON pricing                             | RedStone MON/USD read directly on chain; no paid API subscription needed                                               |
| Team profile                                           | David and Santi confirmed in the portal                                                                                |
| Honest usage/traction                                  | No external user adoption, non-demo TVL, revenue or independent audit claimed                                          |
| Final submission                                       | Authorized, but the final form opens 22 September; retain a confirmation when actually submitted                       |

## Timing and rules source

The signed-in Metropolis Rules & Guidelines v3.0 (updated 3 September 2026), recorded on 8 September, require public GitHub source, an OSI-approved license, setup/build history, attribution and AI disclosure. They accept Monad mainnet or testnet and require a public product video no longer than three minutes. The public FAQ says open source is encouraged rather than mandatory. The authenticated onboarding route now redirects to the dashboard, so the discrepancy remains unresolved. Recheck the operative final form when it opens; do not publish the repository without a later owner instruction.

Recorded deadline: **13 October 2026, 23:59 ET**, equivalent to **14 October 2026, 05:59 CEST**. Internal target: **12 October, 18:00 Europe/Berlin**. The project workspace showed submissions opening on 22 September. The build window itself began 1 September, as the [Monad Foundation's event listing](https://luma.com/metropolis-hangzhou-sep-2026) confirms.

Before final submission, inspect the current [project workspace](https://hackathon.monad.xyz/project) and [registration rules](https://hackathon.monad.xyz/onboarding), confirm the saved new repository link, verify signed-out access to all artifacts, and retain the submission confirmation. No sponsor bounty is selected or claimed; an external Kuru link does not establish a qualifying integration.

Sponsor priorities and the evidence required for each candidate are recorded in [SPONSOR_STRATEGY.md](SPONSOR_STRATEGY.md). Dynamic is the first implemented sponsor integration. Kuru needs actual orderbook execution and usage evidence; Agora is deferred because its bounty mandates Mera, AUSD and Perpl together. The signed-in Dynamic, Kuru, Agora and CRE requirements were reviewed on 14 September. Keep proposed integrations out of completed-work claims until configured and exercised.

Owner decision, 9 September 2026: keep the repository private for now. Do not change its visibility without a later explicit instruction. The recorded registration rules and public FAQ conflict on source publication; resolve this before final submission.
