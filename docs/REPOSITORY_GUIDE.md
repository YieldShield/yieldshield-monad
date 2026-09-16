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

## Imported and historical material

| Location | How to read it |
| --- | --- |
| [`apps/web/`](../apps/web/) | Imported Base/Robinhood frontend. It is not the Monad website. Its stock assets and trading routes do not imply Monad support. |
| Other files in [`services/`](../services/) and prior-chain scripts | Retained Base/Robinhood tooling. Their addresses, seeded balances and release evidence are not the Monad deployment. |
| [`contracts/README.md`](../contracts/README.md) | Historical standalone contract-workspace setup. Use the root README's pinned versions and commands for this repository. |
| `contracts/*AUDIT*.md`, `contracts/*REVIEW*.md`, `contracts/*REMEDIATION*.md`, [`contracts/docs_ok/`](../contracts/docs_ok/) | Historical internal reviews, AI-assisted analyses, design notes and remediation records. Their titles are not evidence of an independent third-party audit or of current findings being resolved. |
| [`contracts/.github/`](../contracts/.github/) | Imported workflow and dependency-update configuration for an earlier standalone repository. Only root `.github/` configuration applies here. |
| [`packages/`](../packages/) | Shared and imported SDK/adapter workspaces. Inclusion does not mean every adapter is enabled in the Monad app. |

The review reports remain available, including their findings and conclusions. Added context banners do not change the original findings, establish remediation, or substitute for an independent audit. Assess applicability against the exact deployed code and current tests.

## Provenance and evidence boundaries

The baseline is the Base snapshot at `62eba773f65f8e030e602540d0191c5764147fe9`, imported as `b44fba0`. [BASE_IMPORT.json](BASE_IMPORT.json) records the hashes at import time, not the current hashes of subsequently edited files. [PROVENANCE.md](PROVENANCE.md) and [HACKATHON_DELTA.md](HACKATHON_DELTA.md) distinguish prior work, new Monad work and AI assistance. The original Git history and import ledger are preserved.

Use a report's date, revision, network and stated method when evaluating evidence. The current release has internal tests and recorded testnet transactions; it has no claimed independent audit, external adoption, revenue or real-money TVL. Dynamic authentication is configured, but signed-in browser transaction evidence remains pending unless a later release record explicitly documents it.
