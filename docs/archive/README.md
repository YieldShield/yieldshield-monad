# Historical source and report index

For current setup use the [root README](../../README.md); for deployment use the [Monad runbook](../OPERATIONS.md). This index preserves context and attribution. Historical commands, networks, addresses and review conclusions must be read against their recorded revision.

## Removed application tooling

The last main-branch snapshot before this cleanup is [`49dfb04`](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a). No Git history was rewritten.

| Historical material | Exact source revision |
| --- | --- |
| Base/Robinhood frontend and image licenses | [apps/web](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/apps/web) |
| Solana SDK, Solana adapter, legacy EVM adapter and shared core | [packages](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/packages) |
| Solana serverless faucet and mint catalog | [api/drip.mjs](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/api/drip.mjs), [catalog](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/devnet-faucet-mints.json) |
| Previous-chain services | [services](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/services) |
| Previous-chain deployment scripts | [scripts](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/scripts) |
| Standalone contract workflows | [contracts/.github](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/contracts/.github) |

The three Base module generation/verification scripts remain in the current tree because Monad uses their output. The shared Solidity contracts, tests, library pins and deployment manifests are retained at their existing paths.

## Retained historical documents

Original findings and conclusions remain intact. These internal reviews and AI-assisted analyses are not independent third-party audits or evidence that all findings are resolved.

- [Imported contract-workspace guide](../../contracts/README.md).
- [Internal security reports and earlier design documents](../../contracts/docs_ok/).
- [Contract review files](../../contracts/) and [historical deployment/configuration records](../../contracts/config/).
- [Initial implementation plan](../IMPLEMENTATION_PLAN.md), [simplification plan](../SIMPLIFICATION_PLAN.md), [design studies](../design/2026-09-15/README.md), and [Clarity rollout](../CLARITY_ROLLOUT.md).

## Provenance

The cleanup does not alter [BASE_IMPORT.json](../BASE_IMPORT.json), the original per-file import hashes. The [provenance record](../PROVENANCE.md) and [hackathon reuse disclosure](../HACKATHON_DELTA.md) still distinguish the existing protocol from Monad-specific work. Deleted workspaces and their license notices can be inspected at the immutable links above.
