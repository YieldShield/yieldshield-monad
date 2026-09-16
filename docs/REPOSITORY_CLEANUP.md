# Monad repository cleanup — 16 September 2026

The current tree now contains one npm app workspace, `apps/monad-web`, plus the isolated Monad API and retained contract tooling. Unused Solana/Base/Robinhood applications, adapters, operator scripts, root faucet and deployment configuration were removed in separate commits. [Historical source and notices](archive/README.md) remain accessible at a fixed revision; Git history and the import manifest are unchanged.

The branch includes the pending contract dependency fix from [PR #17](https://github.com/YieldShield/yieldshield-monad/pull/17). It restores the deployed OpenZeppelin revisions and enforces them in CI. The cleanup itself changes no app/API source, Solidity source, deployed addresses or existing transaction evidence.

## Measured results

| Measurement | Before | After |
| --- | ---: | ---: |
| Root lockfile dependency entries | 1,134 | 754 |
| App/SDK workspaces | 6 | 1 |
| Audited npm lockfiles | 4 | 3 |
| Emitted JavaScript chunks | 87 | 87 |
| JavaScript bytes | 6,777,569 | 6,777,569 |
| Gzipped JavaScript bytes | 1,779,083 | 1,779,083 |

All 87 JavaScript chunk names, hashes and sizes match the pre-cleanup build. The 380 fewer dependency entries represent a 33.5% reduction in the root lockfile; optional entries vary by operating system. No retained dependency versions changed. This improves repository/install maintenance, not browser download size. Build warnings about large wallet chunks remain unchanged.

Dynamic's Ethereum connector still depends on its multichain wallet infrastructure and therefore installs some Solana packages. There are no direct Solana dependencies in any first-party manifest. The existing security overrides and two temporary browser-only advisory exceptions remain in force; see [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md).

## Verification

- Clean Node 24.14.0 installation; frontend type check and production build passed.
- 99 frontend and 78 API/deployment tests passed, including the latest custom-pool changes.
- 32 Monad contract tests passed; five optional live-fork checks were skipped. All 225 retained immutable-module regressions passed.
- All 153 contract-tool tests passed with their own clean installation. The former standalone workflow is labelled historical test data for its policy assertions.
- Five scope and seven dependency-gate tests passed. CI now rejects retired entry points, direct Solana/codegen dependencies, unexpected workspaces and stale local-workspace lock records. The complete browser-module check rejects retired first-party workspace code as well as the existing prohibited native/parser modules.
- The Monad API and contract-tool dependency audits are clean. The browser audit still reports the same nine affected package entries from two reviewed advisories, expiring 16 October 2026. All 5,561 emitted modules passed the exposure check.
- All 47 source hashes in the saved deployed `SplitRiskPool` artifact match the cleaned checkout. Solidity source paths, deployment records and shared Base module generators remain intact.
- The cleaned local API returned HTTP 200 for health, status and creation options; all seven markets were ready with fresh RedStone data.
- Browser checks covered landing assets, AUSD selection and its 500-unit bond, custom pool terms, protection amount recalculation, providing backing, gas-first faucet guidance, disconnected positions and network status. No browser console errors were captured.

The [machine-readable record](evidence/repository-cleanup.json) contains the counts and emitted chunk inventory. No wallet login or signed browser transaction was completed; the isolated preview origin is not configured for Dynamic authentication. No production or contract deployment was performed, and contract redeployment is not required for this cleanup.
