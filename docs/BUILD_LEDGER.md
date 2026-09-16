# Monad build ledger

## Product guide — 16 September 2026

At the owner's request, replaced the calculator-only How it works page with a complete product guide: the existing captioned video and transcript, holder/provider roles, deposit-to-exit steps, the interactive calculator, and explanations of caps, fees, withdrawal conditions and testnet assets. Removed Build evidence from the app and stopped importing transaction journals into the browser bundle. The old `/evidence` URL redirects to `/how-it-works`; `/lab` redirects to its calculator section. Internal verification journals remain available in the repository.

Validation: all 74 frontend tests and the production build passed. Browser checks confirmed video playback with captions, calculator keyboard interactions, FAQ expansion, legacy URL navigation, and responsive layouts down to a 320px viewport without horizontal overflow. No browser console errors were captured on the product guide.

## Implementation history

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

The repository is private during implementation. Public visibility requires explicit approval after automated review rejected public disclosure of the imported source. The recorded registration rules and public FAQ conflict on source publication; the final form needs a fresh check.

## Tool disclosure

Implementation uses OpenAI Codex for code, tests, documentation, debugging and deployment. Original upstream code and dependency authors retain attribution. No interviews, user testing or external endorsements will be claimed unless performed.

## Committed stages and actual evidence

| Commit  | Stage                                                                      |
| ------- | -------------------------------------------------------------------------- |
| b44fba0 | Attributed prior-work foundation                                           |
| 2ad6988 | Independent Monad network configuration                                    |
| 0b1d46f | Monad contracts and lifecycle tests                                        |
| 65943e3 | Sequential deployment and canonical receipts                               |
| 20c3e0f | Read-only Monad API                                                        |
| e3e75b2 | Monad consumer app and wallet journeys                                     |
| 98bd80f | Railway/Vercel release configuration                                       |
| 71ca717 | Partial exits, maturity timing, target checks and pending receipt recovery |
| c14d039 | Reference activation, signed-price validation and journey-evidence tooling |
| f102662 | Pinned CI, Node and Foundry toolchains                                     |

The first hosted CI run passed: https://github.com/YieldShield/yieldshield-monad/actions/runs/34365837836 . It ran 53 API/deployment checks, 4 UI calculation/timing tests, 16 Monad Solidity tests and 225 imported module regressions, plus the production build.

Both scenario and reference transaction journeys completed on 14 September, with recipient balance checks and preserved journals. The core release has 39 named contracts, five pools and ten receipt NFTs verified. One shMON exit exhausted its gas limit; its canonical failed receipt and separately reviewed successful retry remain in the reference journal. Dynamic onboarding is configured and deployed; browser signing remains to be evidenced. A 2:34 narrated product overview, captions and transcript are published with the receipt evidence page.

Owner decision, 9 September 2026: keep the repository private for now. Do not change its visibility without a later explicit instruction. Keep that decision in force while resolving the rule discrepancy.

Responsive review: the home, market and calculator views were rendered in 390×844 local browser frames. The review found and fixed decorative artwork causing horizontal overflow on the homepage. This is a layout check, not a completed mobile wallet journey.

Sponsor review, 9 September 2026: recorded the official published bounties, separated credits and winner benefits from integration opportunities, prioritized Dynamic onboarding, and documented Kuru/Agora/CRE feasibility and evidence gates in `SPONSOR_STRATEGY.md`. The owner requested ongoing sponsor attention; daily checks are scheduled through the deadline. This step changes the build priorities and documentation; it does not activate a sponsor integration or claim eligibility. Detailed portal terms await a refreshed sign-in.

## 14 September continuation

| Commit  | Stage                                                                                    |
| ------- | ---------------------------------------------------------------------------------------- |
| 2f07243 | Release unused fee reservations only from fresh canonical receipt costs                  |
| 205cb89 | Fund both scenario pools and test-asset inventory                                        |
| abcbe87 | Read signed-in Dynamic, Kuru, Agora and CRE requirements                                 |
| 70549db | Respect the public RPC's request limit                                                   |
| 5f057cb | Complete and preserve scenario transaction journeys                                      |
| 9615bf3 | Add the separately identified strict RedStone adapter and reference recipe               |
| 8e14b6a | Verify and activate all five markets; report RedStone provenance; share pending API work |
| 5b31cbb | Increase gas margin and record the reviewed failed-transaction recovery                  |
| 3f5b4f8 | Integrate Dynamic authentication and embedded wallets with guarded signing               |

The existing Metropolis draft now points to the new private repository, and both David and Santi are confirmed on the team. Final submissions open on 22 September. No sponsor bounty has been selected or claimed.

The full verification run passed after the reference release and Dynamic integration: https://github.com/YieldShield/yieldshield-monad/actions/runs/34834802478 . This includes 65 API/deployment tests, 8 UI tests, Monad Solidity tests, imported protocol regressions and the production build. The narrated screenshot overview is not a live wallet recording; its hash and chapter timings are in `docs/evidence/video-overview.json`.

## 15 September usability and deployment review

The production API at 13:02 UTC reported chain 10143, all 39 code checks passing, five ready and unpaused pools, and a one-second-old MON reference. Railway reported a successful deployment. The older banner in an already-open browser tab disappeared after refresh. The wallet selection dialog opened successfully; a completed Dynamic browser signing journey is still not claimed. Existing confirmed receipt suites remain the contract-execution evidence. Kuru orderbook trading is not integrated, and the full shMON unstake queue remains untested.

Renamed Test assets to Faucet at `/faucet`, retaining the old `/tokens` route as a redirect. Added MON-first onboarding, balance-aware action links, and specific claim/wrap/stake/vault preparation links for empty input balances. Markets now explicitly presents itself as a pool comparison page. The 18 UI tests cover visitors, empty native/token balances, funded wallets, unknown or failed reads, and pending transactions; the production build passes. The local browser verified the redirect, two-step Faucet layout, market data and Trade quote without console errors. These are UI and read-only checks, not a signed wallet journey.

The Faucet release is live at `monad.yieldshield.ai` from `e6d16a7` (implementation `386c20b`), Vercel deployment `dpl_DnuDvnLfNU9VypCuGFvJqBvnopfk`. [All release checks passed](https://github.com/YieldShield/yieldshield-monad/actions/runs/34973865156). Production browser verification confirmed the legacy redirect and the Dynamic email/wallet sign-in screen, with no console warnings or errors. At 13:18 UTC the faucet held 5,000,000 TestUSDC and 500,000 sMON-demo.

**Open reliability issue found after release:** hosted status snapshots at 13:18 and 13:19 UTC reported four and three ready pools respectively. Contract verification and asset price health remained successful, but individual pool state reads failed. Logs from active Railway deployment `40365284-de12-413d-8670-2b02fb340eeb` confirm repeated `ContractFunctionExecutionError: RPC Request failed` events across different pools. Two independent local status reads succeeded with all five pools (11.1 seconds cold, 5.6 seconds warm), but the longer-running local preview API also logged matching intermittent warnings, found when collecting its output at shutdown. The cause is not established, and no fix is claimed. Failed reads correctly disable the affected pool's actions; resolving this reliability issue remains necessary before claiming consistently available user flows.

## 15 September simplification release

Applied task-focused navigation, progressive disclosure and concise content guidance documented in [SIMPLIFICATION_PLAN.md](SIMPLIFICATION_PLAN.md). Four primary links replace the previous eight destinations; comparison, demo trading and specialist pages remain under More. Protect/Provide now have one compact action panel and an explicit WMON default. Faucet starts with MON and test-token claims, with wrapping, staking, vault actions and demo funding in accessible disclosures. Fees, waits, capped surrender exits, first-loss exposure and wallet guards remain explicit.

Main-region word counts fell from 219 to 61 on Home, 174 to 73 on Protect, and 292 to 79 on Faucet with tools collapsed. The plan records measurement limits. Browser checks covered all six core pages at 390px, keyboard disclosures/More, deep links, market selection, amount preservation, and the live Dynamic sign-in dialog. No wallet login or new transaction was submitted.

Separate commits: `0a43e43` plan; `5b496da` navigation/home; `421235a` action screens; `00a1702` Faucet/funding; `08f503f` verification refinements; `fa5e8cb` wallet copy. The final app artifact is Vercel deployment `dpl_CcSHYV6vokDyyJF5gyT8VhSBcB6S`, [aliased to the existing domain](https://monad.yieldshield.ai/). The initial implementation's full [CI run passed](https://github.com/YieldShield/yieldshield-monad/actions/runs/34978125829); the final `fa5e8cb` [release checks also passed](https://github.com/YieldShield/yieldshield-monad/actions/runs/34978634951), including 35 frontend tests, API/deployment checks, Monad lifecycle tests, imported contract regressions and the production build. The final wallet chooser copy was verified on the live alias without browser warnings or errors.

The repository remains private. No API or contract deployment changed. The existing intermittent pool-read failure was reproduced during live verification and remains unresolved; affected actions continue to be disabled. The prior contract-execution evidence and unverified Dynamic signing/full unstaking limitations remain unchanged.

## 15 September full deployment recheck

Independent reviews found and fixed the public RPC rate-limit handling, wallet-selection races during multi-step actions, loss of in-memory pending receipt locks when storage fails, stale trade expiry after approval, missing pool-creation funding guidance, hidden position-status loading errors and the calculator's omission of creator/protocol gain fees. Each fix was committed separately; the complete list and evidence are in [VERIFICATION_2026-09-15.md](VERIFICATION_2026-09-15.md).

The frontend is deployed from `8dcee07` as Vercel `dpl_C97tZo5eQhrzDeQiiq4TidnXUoPc`, on the existing domain. Railway successfully deployed the API at `35d9a7f` as `bab25646-09da-4345-9f03-57a284568a66`. [All 394 release tests and build checks passed](https://github.com/YieldShield/yieldshield-monad/actions/runs/34981040829). The fresh verifier also passed all 39 contracts, five pools and ten receipt NFTs; evidence was committed as `a87423b`. Eight production samples returned all five pools ready/unpaused, with no captured failures and reference ages of 6–12 seconds on arrival.

No new blockchain transactions were broadcast. A user wallet sign-in was requested; a signed Dynamic browser journey and completed shMON unstake remain unverified. The historical receipt journals remain intact. Repository visibility remains private.


## 16 September product video refresh

Rebuilt the How it works video with current application captures, the site’s typography and colors, animated explanations, and ElevenLabs Chris narration. The 2:08 overview covers setup, Protect, falling and rising prices, the provider’s first-loss role, and the main limits. Added speech-aligned English captions, a matching transcript and poster. The recording uses real interface captures and labeled illustrations; no wallet signing is shown. The old media URLs redirect to the replacement.


## 16 September video motion correction

Replaced the drifting exit-path marker with sequential exit-choice cards. Removed crossfades between text-heavy screens so headings and values never overlap. Replaced calculator crops with legible animated value bars, timed the fee and provider calculations to the existing ElevenLabs narration, and made chapter progress cumulative. Reviewed intermediate animation frames and retained the original 2:08 duration. Earlier video links redirect to the revised cut.
