# Metropolis new-work and reuse disclosure

## Baseline

YieldShield existed before Metropolis. The independent Monad repository began with an attributed snapshot of `YieldShield/yieldshield-base`, source revision `62eba773f65f8e030e602540d0191c5764147fe9`, imported as commit `b44fba0`. `docs/BASE_IMPORT.json` records imported file hashes and submodule identities. That import commit is **prior work**, regardless of its September commit date.

The existing protocol design, pool and factory accounting, NFTs, governance, immutable modules and many regression tests are reused. Other-chain applications and deployment recipes remain as historical source. Their features, deployments, test counts and seeded balances must not be presented as new Monad work or user adoption.

## New and adapted work in this repository

| Work                                                                     | Provenance                                                                                               | Review locations                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Monad consumer application                                               | New active workspace and visual design, informed by the existing Base product                            | `apps/monad-web/`                                                                        |
| MON wrapper and shMON native staking router                              | New narrow contracts                                                                                     | `MonadWrappedNative.sol`, `MonadStakingRouter.sol`                                       |
| RedStone MON reference, historical Pyth adapter and shMON redemption NAV | New contract integration and validation policy                                                           | `MonadRedstoneReferenceFeed.sol`, `MonadReferenceFeed.sol`, reference-feed/staking tests |
| Testnet timing initializer                                               | New pinned adapter over the imported initializer; original accounting retained                           | `MonadPoolInitializeModule.sol`                                                          |
| Scenario token/oracle, exchange, NAV-backed payout and test vault        | Adaptations of the existing Base alpha demonstration contracts, not newly invented mechanisms            | Other `contracts/contracts/monad/` files                                                 |
| Dynamic wallet onboarding                                                | New SDK integration in isolated Monad environment, built-in authentication and transaction confirmations | `DynamicWallet.tsx`, `dynamic-session.ts`, session tests                                 |
| Network-specific deployment and verification                             | Adapted sequential deployment/receipt approach, new independent recipes and network guards               | `scripts/*monad*`, `config/`                                                             |
| Monad read-only status and signed-update service                         | New service using existing product/accounting concepts                                                   | `services/monad/`                                                                        |
| Contract regression evidence                                             | Imported immutable-module suite plus adapted/new Monad cases                                             | `contracts/test/base-modules/`, `contracts/test/monad/`                                  |
| Hosting and operational evidence                                         | New isolated Vercel/Railway projects, domains, journals and release process                              | `Dockerfile`, `vercel.json`, `railway.json`, `docs/evidence/`                            |

Review the actual diff with `git diff b44fba0..main`; use the per-file import manifest to distinguish renamed/adapted source from wholly new work. Do not infer originality from lines added or a fresh repository timestamp. The 298 passing checks include substantial prior regression coverage, and are not 298 new Monad tests.

## Tool and dependency disclosure

OpenAI Codex assisted with research, implementation, tests, debugging, documentation and deployment. It generated and edited code under David Hawig's direction. No AI agent has custody of user assets in the product; the deployed API has no wallet signing key. Official RedStone/Pyth/shMonad/Dynamic interfaces and documentation informed the integrations; their external implementations are not claimed as YieldShield inventions. Third-party license notices are retained.

## Eligibility boundary

The recorded registration rules require substantial new functionality and a substantial majority of submitted work created during the hackathon. The official event schedule begins 1 September 2026; these Monad implementation commits are dated 9 September, within that schedule. This timing alone does not prove the originality requirement. Present the Monad milestone and the above reuse candidly, and let organizers assess eligibility. Do not describe the entire protocol as built from scratch for Metropolis.

The build-window dates are corroborated by the [Monad Foundation-hosted Hangzhou event](https://luma.com/metropolis-hangzhou-sep-2026). The operative submission rules were recorded from the signed-in registration flow on 8 September (version 3.0, updated 3 September); re-open those current rules before final submission.
