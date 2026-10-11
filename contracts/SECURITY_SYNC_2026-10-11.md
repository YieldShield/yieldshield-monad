# Contract security synchronization — 2026-10-11

This update imports the canonical YieldShield/smart-contracts security fixes listed in [upstream-source.json](upstream-source.json). It preserves this repository's chain contracts, BaseStockTokenLib integration, four existing ceiling-rounding protections, and pinned Foundry dependencies.

The deployable implementation uses immutable routers and generated modules. Both the reference implementations and their generated runtime modules were updated. Updating only the reference monolith would not update the runtime implementation used by this repository.

| Runtime path | Patched module | Change |
| --- | --- | --- |
| Shielded deposits | BasePoolDepositsModule | Enforce the opening policy advertised by a directly configured stock oracle; reject malformed advertised policy. |
| Pool governance handoff | BasePoolAdminModule | Retain factory coordination when the same governance candidate is re-proposed. |
| Factory governance handoff | BaseFactoryAdminModule | Clear migration bookkeeping when tracked pool operations are cancelled. |
| Commission claims, forfeitures, and settlement | BasePoolFeesModule | Restrict each receipt's claim to its own epoch reserve. |
| Protector exits | BasePoolProtectorModule | Apply the same epoch reserve restriction during exit settlement. |
| Commission reads | BasePoolViewsModule | Report claims bounded by the correct epoch reserve. |
| Composite price source and vault integration | CompositeOracle | Publish normalized precision and reject nested CompositeOracle routes that could hide policy or circuit-breaker state. |

The shared internal helpers were regenerated in every pool module, including modules where the compiler removes unreachable helpers. The pool and factory router selector assignments remain unchanged. No storage declarations were added or reordered.

New parity regressions run the oracle, governance, and reward cases through size-checked module deployments. Additional routed tests seed an overallocated current reward index and verify that both claims and forfeitures preserve historical reserves. The independent module verifier checks compiler source digests, exact storage layouts, complete selector coverage, and runtime/initcode limits.

ABIs are regenerated from this repository's local compiler artifacts. The ABI generation command does not rewrite deployment addresses or manifests.

Pool and router upgrades are disabled. These source changes require redeployment and a separate migration plan; the existing deployment records still describe the previously deployed bytecode. No deployment, on-chain transaction, or manifest publication is part of this update.

ABI command: `npm run generate:abis`. The separate `sync:monad` publication workflow retains its deployment verification requirements.

## Validation

- 355 module, Monad adapter/lifecycle, fuzz, and follow-up contract tests passed with the CI-pinned Foundry 1.8.1 and Solidity 0.8.35, under the repository's native Monad configuration. Five optional live-fork tests were skipped without RPC configuration.
- 129 Monad service/script tests passed, including ABI generation without deployment metadata or manifest changes. App typecheck passed.
- All 15 routers/modules preserve exact storage layouts and 215 original selectors; largest runtime is 21,063 bytes, below the 24,576-byte limit.
- Foundry dependency lock verification passed without changing recorded gitlinks.
- ABI regeneration matched the current published interface files; deployment manifests, addresses, and evidence remain unchanged.

The pinned Foundry release was downloaded into a temporary directory and verified against its published SHA-256 checksum. The installed developer toolchain was unchanged.
