# Base modular implementation review

Reviewed on 2026-09-08. This is an internal engineering review of the Base alpha adaptation, not an independent audit. The release is intended for Base Sepolia test assets.

## Why modules exist

The imported pool and factory implementations exceed Base's 24,576-byte runtime limit. The Base deployment therefore uses immutable selector routers behind the existing ERC1967 proxies. Eight pool modules and five factory modules retain the original storage declarations, inheritance, ABI, and reachable implementation bodies. The original application ABI remains usable through the proxies.

The routers store module addresses as immutables and expose no routing mutation. They explicitly preserve direct `proxiableUUID()` behavior for factory validation, reject delegated UUID calls, and reject `upgradeToAndCall` with the original `UpgradeDisabled()` error. Router and module constructors disable initialization of implementation instances. Factory/pool proxies must still be initialized atomically during deployment.

## Corrections made during review

- Dependency traversal includes inherited methods and modifiers. This preserves calls such as `whenNotPaused -> _requireNotPaused -> paused()` when the pool overrides `paused()`.
- Only selected entry points, transitive dependencies, and internal overrides are reachability roots. Internal helper bodies remain unchanged; the compiler eliminates unused helpers.
- Initialization is a separate pool module to retain deployment-size headroom.
- Unknown selectors and direct ETH transfers fail closed. Unselected explicit module entry points are reverting stubs. Some inherited methods and compiler-generated getters remain in the module ABI; the immutable router determines what is reachable from the protocol proxy.
- The factory modules include the narrowly scoped canonical Base B20 `scaledBalanceOf` compatibility change from the oracle review. Other rebasing-token checks remain present.

## Evidence

`forge test --root contracts --match-path 'test/base-modules/*.t.sol' --offline --extra-output storageLayout` passed **206 tests in seven suites** with zero failures. The suites reuse original factory, pool accounting, commission, cross-asset fee, and NFT callback regressions with module deployments. Additional checks exercise cross-module callback reentrancy, locked initialization, denied upgrades, unknown/empty calldata, invalid module addresses, and every original selector.

`node scripts/verify-base-modules.mjs` confirms:

- Exact normalized compiler storage-layout parity across all 13 modules.
- 111 pool selectors and 104 factory selectors preserved, with no router-selector collisions.
- Zero sequential router storage slots; initialization uses OpenZeppelin's namespaced slot.
- All 15 router/module contracts meet Base runtime and initcode limits, including router constructor arguments. Largest module runtime is **21,045 bytes**, versus the 24,576-byte limit.
- Compiled source hashes match the current implementation and imported dependencies, rejecting stale build artifacts.

Exact sizes are recorded in `base-module-verification.json`. Selector assignments and constructor order are recorded in `base-modules.json`.

## Reproduction and deployment

After changing an original implementation, first compile it, then run:

```sh
node scripts/generate-base-modules.mjs
node scripts/generate-base-parity-tests.mjs
forge test --root contracts --match-path 'test/base-modules/*.t.sol' --offline --extra-output storageLayout
node scripts/verify-base-modules.mjs
```

The deployment order is libraries, modules, routers, and atomically initialized proxies. Pool router constructor arguments are Admin, Deposits, Fees, Initialize, PartialExit, Protector, ShieldExit, Views. Factory arguments are Admin, Create, Lifecycle, Oracle, Views. Factory Admin/Lifecycle/Oracle link `TokenWhitelistLib`; Factory Create links `PoolCreationLib` and `PoolValidationLib`. Pool modules have no external library link references.

Deployment tooling must bind those arguments and linked libraries to the reviewed artifacts and verify deployed runtime bytecode. The router's immutable addresses make the initial deployment selection security-critical. Module generation is an additional transformation to review whenever upstream implementations or inherited dependencies change. This review does not establish suitability for real funds or certify the external token and oracle systems.
