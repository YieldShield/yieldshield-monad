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
