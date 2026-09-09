# Metropolis submission packet — working draft

**Status: not ready to submit.** Registration and the project draft were completed previously. This implementation task does not submit or update the portal. Final submission will be handled when David requests it.

## Entry facts

- Project: **YieldShield on Monad**
- Track: **Onchain Finance & Trading**
- Demo: https://monad.yieldshield.ai
- Source: https://github.com/YieldShield/yieldshield-monad — currently private; public access still required.
- Network: Monad **testnet**, chain 10143.
- Operator: Hawig Ventures UG (haftungsbeschränkt), Herzogin-Juliana-Straße 7, 55469 Simmern, Germany. Managing Director David Hawig. HRB 24975, Amtsgericht Bad Kreuznach.
- Contact: david@yieldshield.ai
- Team: David and Santiago, intended size two. Santiago's portal account/join status still needs confirmation; email alone was not sufficient for the portal invitation.
- X: https://x.com/yieldshield_ai
- Prior funding and awards: none, as supplied by David. Prior participation or overlapping-event submissions were not established.

## Short description

YieldShield on Monad gives crypto holders two exit choices backed by separately supplied first-loss capital. The Monad application combines native MON handling, a shMON staking integration, explicit asset and price identities, wallet transaction checks, and a separate scenario lab that explains gains, losses and backing payouts.

## Current progress wording

We have built and deployed the Monad-branded frontend and read-only API, implemented the Monad integration contracts, and verified the first 20 contracts on Monad testnet. The native MON wrapper has been exercised with a confirmed transaction and matching native backing. Pool deployment and live reference-price activation remain pending additional testnet gas and Pyth account setup. We are not claiming a completed protection journey or funded active market yet.

Replace that paragraph only after the remaining deployment and actual journey checks succeed. Link to verified pool addresses, receipt transactions, a fixed release revision and the public video. Do not use screenshots of a planned market as evidence that it is active.

## Reuse and AI disclosure

YieldShield predates this event. We reused the existing protocol, accounting, receipt NFTs and immutable-module foundation. The new milestone is the Monad application and deployment, native MON and shMON handling, strict Pyth/reference adapters, independent scenario environment, public status service, wallet checks and reproducible evidence. The detailed file-level disclosure is in [HACKATHON_DELTA.md](HACKATHON_DELTA.md). OpenAI Codex assisted with code, tests, documentation, debugging and deployment.

## Founder bio

David Hawig previously served as Director of Ecosystem at Web3 Foundation and founded his own startup. He is Managing Director of Hawig Ventures UG (haftungsbeschränkt), building YieldShield with a two-person team. His focus for Metropolis is bringing collateral-backed crypto protection to Monad with understandable fees, backing and exit conditions. He is available full-time throughout the week.

Career details and company data above were provided by David. No employment dates, startup exit, funding history or third-party endorsement is inferred.

## Readiness gates

| Requirement | Current evidence / remaining work |
| --- | --- |
| Public working app | Frontend and API deployed; full market workflow still pending activation |
| Monad mainnet or testnet deployment | 20 contracts verified; wrapper transaction completed; funded pools and receipt journeys pending |
| Exact source under an OSI-approved license | MIT new code and retained file-level notices; repository publication requires explicit owner approval |
| Substantial new build-window work and reuse disclosure | Import baseline, separate stage commits and new-work disclosure present; eligibility ultimately assessed by organizers |
| Setup and technical documentation | README, architecture, operations and evidence files present |
| Public video ≤3 minutes | Script prepared in DEMO_GUIDE.md; recording and public hosting pending |
| Fresh external MON pricing | Pyth account/API key and ongoing service access pending |
| Team profile | David registered; Santiago's joined portal identity needs confirmation |
| Honest usage/traction | No external user adoption, non-demo TVL, revenue or independent audit claimed |
| Final submission | Not requested in this task; recheck current rules, forms and links before submitting |

## Timing and rules source

The signed-in Metropolis Rules & Guidelines v3.0 (updated 3 September 2026), recorded on 8 September, require public GitHub source, an OSI-approved license, setup/build history, attribution and AI disclosure. They accept Monad mainnet or testnet and require a public product video no longer than three minutes. They are stricter than the public page's open-source FAQ; use the registration requirements.

Recorded deadline: **13 October 2026, 23:59 ET**, equivalent to **14 October 2026, 05:59 CEST**. Internal target: **12 October, 18:00 Europe/Berlin**. The project workspace showed submissions opening on 22 September. The build window itself began 1 September, as the [Monad Foundation's event listing](https://luma.com/metropolis-hangzhou-sep-2026) confirms.

Before final submission, inspect the current [project workspace](https://hackathon.monad.xyz/project) and [registration rules](https://hackathon.monad.xyz/onboarding), replace the existing legacy repository link, verify signed-out access to all artifacts, and retain the submission confirmation. No sponsor bounty is selected or claimed; an external Kuru link does not establish a qualifying integration.

Sponsor priorities and the evidence required for each candidate are recorded in [SPONSOR_STRATEGY.md](SPONSOR_STRATEGY.md). Dynamic is the first integration to pursue, followed by Kuru and conditional Agora mobile trading. Detailed bounty terms still require a refreshed portal sign-in; the public titles alone do not establish eligibility. Keep proposed integrations out of completed-work claims until configured and exercised.

Owner decision, 9 September 2026: keep the repository private for now. Do not change its visibility without a later explicit instruction. Public source remains a requirement before final Metropolis submission.
