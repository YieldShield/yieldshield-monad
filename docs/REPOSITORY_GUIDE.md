# Repository guide

This repository contains the active Monad testnet application and its attributed YieldShield foundation. Start with the [root README](../README.md); use the [16 September release record](ASSET_EXPANSION_RELEASE.md) for the current deployment. Historical addresses, screenshots, reports and setup commands apply only to the network and revision recorded with them.

## Active Monad product

| Location | Purpose |
| --- | --- |
| [`apps/monad-web/`](../apps/monad-web/) | The website deployed at monad.yieldshield.ai; root `dev`, `build` and `test:web` commands select this app. |
| [`services/monad/`](../services/monad/) | Read-only Monad API; root `start:api` and `test:monad` commands use this service. |
| [`config/`](../config/) | Network identity, verified deployment and asset registries, generated ABIs and mainnet research catalog. Catalog inclusion alone does not enable transactions. |
| [`contracts/contracts/monad/`](../contracts/contracts/monad/) | Monad adapters, wrapper, staking router, asset policy and scenario contracts. |
| [`contracts/contracts/base-modules/`](../contracts/contracts/base-modules/) | Reused immutable protocol modules used by the Monad pools. The Base names show provenance; this code remains part of the active deployment. |
| [`contracts/test/monad/`](../contracts/test/monad/), [`contracts/test/base-modules/`](../contracts/test/base-modules/) | Monad-specific checks and retained protocol regressions. |
| [`scripts/`](../scripts/) | `*monad*` deployment, verification and journey tools. Broadcast commands spend testnet gas and require explicit configuration; follow the runbook. |
| [`docs/evidence/`](evidence/) | Timestamped internal release checks and transaction evidence. Scripted journeys do not verify browser signing, user adoption or real-money TVL. |
| [Root CI](../.github/workflows/ci.yml) | Active repository checks; nested workflows are historical files and are not GitHub Actions entry points for this repository. |

Use the [operations runbook](OPERATIONS.md) for deployment and the [submission packet](METROPOLIS_SUBMISSION.md) for remaining demonstration and event requirements. The app targets **Monad testnet, chain 10143**. Mainnet yield assets are catalog entries only.

## Dependencies and historical material

The root npm workspace contains only `apps/monad-web`. `services/monad` and `contracts` keep separate dependency lockfiles; the security gate audits all three installations. `npm run check:scope` rejects undeclared workspaces, direct Solana SDK dependencies and retired application entry points.

The old `apps/web` frontend, Solana SDK and adapter, legacy EVM adapter/core workspaces, root Solana faucet and Base/Robinhood service/deployment tools have been removed from the current tree. They are preserved at an immutable revision in the [historical source and report index](archive/README.md). Original import records and Git history remain intact.

Dynamic's Ethereum connector still brings Solana packages through `@dynamic-labs/waas-evm → @dynamic-labs/waas → @dynamic-labs/solana-core`. These are upstream dependencies, not enabled Solana product features. See [the dependency review](DEPENDENCY_SECURITY.md) for the browser checks and remaining temporary exceptions. The root Dynamic pins are deliberate: they keep npm's security overrides effective.

The `base-modules` Solidity directory, its generators (`generate-base-modules`, `generate-base-parity-tests`, `verify-base-modules`) and regression tests remain active. Preserve their source paths and pinned libraries: deployed bytecode and verification depend on them. The Pyth Solidity dependency is also required by retained oracle sources; it is not a Solana SDK.

Historical reports remain at their existing paths with context banners. Their findings and conclusions are preserved; titles are not evidence of an independent audit or proof of remediation. Use their date, revision and scope to assess applicability.

## Provenance and evidence boundaries

The baseline is the Base snapshot at `62eba773f65f8e030e602540d0191c5764147fe9`, imported as `b44fba0`. [BASE_IMPORT.json](BASE_IMPORT.json) records the hashes at import time, not the current hashes of subsequently edited files. [PROVENANCE.md](PROVENANCE.md) and [HACKATHON_DELTA.md](HACKATHON_DELTA.md) distinguish prior work, new Monad work and AI assistance. The original Git history and import ledger are preserved.

Use a report's date, revision, network and stated method when evaluating evidence. The current release has internal tests and recorded testnet transactions; it has no claimed independent audit, external adoption, revenue or real-money TVL. Dynamic authentication is configured, but signed-in browser transaction evidence remains pending unless a later release record explicitly documents it.
