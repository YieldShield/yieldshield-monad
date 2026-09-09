# Monad build ledger

Each implementation stage is committed separately. The import is prior work, not a new Metropolis contribution.

1. **Attributed foundation** — imported tracked source from YieldShield Base, preserving third-party notices and pinned submodules. Baseline commit `b44fba0`.
2. **Monad configuration** — independent chain registry, Foundry 1.8.1 / Monad execution, plan and build ledger.
3. **Contracts and tests** — strict Pyth reference feed, shMON redemption-NAV adapter, native MON wrapper, separate scenario assets and oracle, test vault, immutable module deployment.
4. **Deployment tooling** — resumable Monad-only deployment, receipt/runtime verification, manifests and smoke evidence.
5. **Read-only API** — verified snapshots, price provenance, action availability and bounded public endpoints.
6. **Monad application** — crypto-only routes, wallet preflight, complete senior/junior lifecycle, wrapping/staking/vault flows, status and scenario explanation.
7. **Release** — Vercel frontend, Railway API, custom domains, signed-out verification.
8. **Submission evidence** — new-work attribution, setup, deployment hashes, demo and remaining submission requirements.

## Publication

The repository is private during implementation. Public visibility requires explicit approval after automated review rejected public disclosure of the imported source. Public source is a Metropolis submission prerequisite.

## Tool disclosure

Implementation uses OpenAI Codex for code, tests, documentation, debugging and deployment. Original upstream code and dependency authors retain attribution. No interviews, user testing or external endorsements will be claimed unless performed.

## Committed stages and actual evidence

| Commit | Stage |
| --- | --- |
| b44fba0 | Attributed prior-work foundation |
| 2ad6988 | Independent Monad network configuration |
| 0b1d46f | Monad contracts and lifecycle tests |
| 65943e3 | Sequential deployment and canonical receipts |
| 20c3e0f | Read-only Monad API |
| e3e75b2 | Monad consumer app and wallet journeys |
| 98bd80f | Railway/Vercel release configuration |
| 71ca717 | Partial exits, maturity timing, target checks and pending receipt recovery |
| c14d039 | Reference activation, signed-price validation and journey-evidence tooling |
| f102662 | Pinned CI, Node and Foundry toolchains |

The first hosted CI run passed: https://github.com/YieldShield/yieldshield-monad/actions/runs/34365837836 . It ran 53 API/deployment checks, 4 UI calculation/timing tests, 16 Monad Solidity tests and 225 imported module regressions, plus the production build.

The wrapper has now been exercised on actual Monad testnet (`docs/evidence/native-wrap.json`). Full scenario/reference journey scripts are implemented but not yet run, because funded pools and authenticated Pyth access are pending. Browser verification so far covers signed-out navigation and unavailable states; full wallet/mobile/user walkthrough evidence remains incomplete.

Owner decision, 9 September 2026: keep the repository private for now. Do not change its visibility without a later explicit instruction. Public source remains a requirement before final Metropolis submission.

Responsive review: the home, market and calculator views were rendered in 390×844 local browser frames. The review found and fixed decorative artwork causing horizontal overflow on the homepage. This is a layout check, not a completed mobile wallet journey.

Sponsor review, 9 September 2026: recorded the official published bounties, separated credits and winner benefits from integration opportunities, prioritized Dynamic onboarding, and documented Kuru/Agora/CRE feasibility and evidence gates in `SPONSOR_STRATEGY.md`. The owner requested ongoing sponsor attention; daily checks are scheduled through the deadline. This step changes the build priorities and documentation; it does not activate a sponsor integration or claim eligibility. Detailed portal terms await a refreshed sign-in.
