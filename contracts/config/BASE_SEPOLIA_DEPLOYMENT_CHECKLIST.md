# Base Sepolia deployment preparation and execution

This path is restricted to chain **84532** and valueless test tokens. Mainnet chain **8453** supplies source observations only. The script does not install, schedule, or enable a recurring relay.

## Prepared files

- `scripts/deploy-base-sepolia.mjs`: default read-only preparation; explicit `--broadcast` executes sequentially.
- `contracts/config/base-us-equity-sessions-2026.json`: 81 explicit regular/early-close sessions, 2026-09-08 through 2026-12-31. Missing dates stay closed. This deliberately excludes extended/overnight sessions.
- `contracts/deployments/base-sepolia-plan.json`: preparation output, unsigned call/deployment data and activation blockers. Pool addresses in dependent call steps are clearly marked placeholders until factory events establish them.
- `contracts/deployments/base-sepolia-alpha.json`: execution/resume manifest containing public addresses, constructor arguments, code hashes, source provenance, transaction intents/hashes and confirmed receipts. No private keys or signed raw transactions are stored.

## Before any broadcast

1. Run `node --test scripts/deploy-base-sepolia.test.mjs`, the modular/oracle Solidity regression suites, and `node scripts/verify-base-modules.mjs`. Compile with `--extra-output storageLayout`. All deployed artifacts and dependency source hashes must match disk.
2. Keep the dedicated key and RPC endpoints only in ignored `contracts/.env.base.local`: `BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `BASE_MAINNET_RPC_URL`. The derived deployer must match **0xA437345Be29EC6802024A8e090E34b621b92E5E2** unless an explicitly reviewed `BASE_SEPOLIA_EXPECTED_DEPLOYER` replaces it. Never put the key in command arguments or deployment JSON.
3. Fund only the dedicated address on Base Sepolia. The default cumulative maximum execution-fee budget is 0.02 test ETH and per-gas cap is 1 gwei. The script retains an additional 0.0001 test ETH balance reserve for L1-data fees; the cumulative execution budget itself does not estimate every L1-data fee. Any cap change must be reviewed against the estimated deployment cost.
4. Run `node scripts/deploy-base-sepolia.mjs --prepare`. Inspect the generated plan, modules/libraries, source token/feed identities, 8-decimal tAAPLc/tNVDAc/tMETAc/tGOOGLc tokens, 6-decimal TestUSDC, and explicit calendar. Regenerate this plan after any deployment-script change; an older prepared plan does not validate a new recipe. Preparation performs read-only RPC calls and writes local artifacts; it never signs or broadcasts.
5. Run the complete local Foundry rehearsal: `forge test --root contracts --match-path 'test/base-modules/BaseSepoliaDeploymentRehearsal.t.sol' --offline --extra-output storageLayout`. It runs the reviewed constructor, bootstrap, governance, four-pool seeding, faucet and withdrawal sequence on an isolated VM with chain ID **84532** and explicit synthetic source/session fixtures. All eight scenarios passed on 2026-09-08; see `BASE_SEPOLIA_REHEARSAL_REPORT.md`. It reads no environment file or public manifest and makes no network transactions. The separate nine deployment-mechanics tests check signing/resume behavior. Do not relax public chain guards, source timestamps, market sessions, or oracle freshness to manufacture activation.

## Execution and pause points

Run `node scripts/deploy-base-sepolia.mjs --broadcast` only after review and funding. It will:

- Deploy original YSToken/YSGovernor and a two-day YSTimelockController. Only the governor receives proposer, executor and canceller roles; the temporary admin renounces its role before factory initialization.
- Recursively link and deploy reviewed libraries/modules, deploy immutable routers, and create the factory proxy with initialization calldata in the same transaction.
- Deploy and permanently register test-token source identities, relay adapters, the Chainlink feed, calendar and Coinbase stock wrapper. All source reports use one source block and retain true source round timestamps. Corporate-action and source-sequencer checks remain enforced.
- Initialize the ERC4626 adapter with the inner ChainlinkOracleFeed and require the source-sequencer relay on both adapters before transferring configuration ownership. Pin the guarded stock wrapper before registering CompositeOracle routes. TestUSDC uses strict protected backing pricing; the unchanged $500 creation-bond floor remains active.
- Finish all token onboarding before closing factory bootstrap. Transfer configuration ownership to the timelock before public faucet distribution. The dedicated deployer initially holds the valueless YS governance supply and serves as relay operator and pause-only guardian. Governance therefore remains centrally controlled during this alpha, subject to the unchanged voting and timelock delays. In its operator role it retains only the relay/operator and pause-only guardian authorities explicitly exposed by those contracts; it cannot rewrite token source identities or bypass market sessions.
- Stop with status `awaiting-live-session` when current source equity prices are older than one hour, a corporate-action pause is active, the source sequencer is unavailable/recovering, or the reviewed session is closed. Resume the same command when the source/session conditions are valid. No fresh timestamps are invented.
- Create four tAAPLc/tNVDAc/tMETAc/tGOOGLc–TestUSDC pools with 150% collateralization, 10% protector commission and 1% pool fee. Each has a 1,000 TestUSDC creation bond, 50,000 TestUSDC backing seed and ten test stock units. Fund and enable the faucet after completing bootstrap and seed operations, then transfer faucet ownership to governance.

## Crash recovery and verification

Each transaction intent, nonce and deterministic signed transaction hash is saved **before** submission. Two sealed-block confirmations and runtime/postcondition checks follow each deployment. The receipt waiter can retain a preconfirmation receipt, so the script independently rereads the receipt and canonical height header, verifies transaction inclusion, and repeats both checks before saving a nonzero block hash. Confirmed resume steps use the same checks. A retry signs the same saved request and requires the same hash; a changed intent, changed runtime, unexpected pending account transaction, or nonce consumed without the known receipt stops execution. Never delete a transaction entry merely to make the script continue.

A local exclusive lock prevents two deployment processes from using the same manifest/account concurrently. If a process is killed without cleanup, confirm that its process is gone and reconcile its last persisted transaction on Base Sepolia before removing the stale lock. A submitted transaction may still confirm after an interrupted process exits.

After completion, verify factory and all pool implementation slots, pinned module/router code hashes, sole governance roles, no factory bootstrap authority, zero extra CompositeOracle callers, permanent source identities, strict TestUSDC pricing, current relay provenance, session behavior, receipt NFT ownership, seed accounting, and funded faucet amounts. Review the manifest before publishing addresses to the frontend/backend. Configure ongoing oracle updates only within the user's separately authorized scope.

## 8 September 2026 receipt reconciliation

The first infrastructure run completed 99 successful transactions but its receipt waiter retained zero block hashes in 97 records. Later RPC reads show nonzero canonical hashes at the same heights. This was a deployment-record defect; it did not change the signed transactions or contract code.

`scripts/reconcile-base-sepolia-receipts.mjs` is a one-off, hash-bound repair for that exact original manifest and the reviewed receipt-only script transition. Its default mode only checks. `--apply` performs the same checks before an atomic local manifest update. It verifies all 99 public transaction signatures and canonical receipts through `sepolia.base.org` and the separately operated `base-sepolia-rpc.publicnode.com`, preserves every original zero-hash receipt and the original manifest/script/recipe digests, and changes no request, nonce, address, source observation, fee policy or deployment operation. Unknown manifests, recipe changes and nonzero block-hash mismatches stop the repair. It loads no wallet key and submits no blockchain transactions.
