# Base Sepolia alpha deployment rehearsal

Date: 2026-09-08. Result: **8 stateful integration scenarios and 9 deployment-mechanics tests passed**. No public-network contract transaction was submitted.

## Scope and isolation

`contracts/test/base-modules/BaseSepoliaDeploymentRehearsal.t.sol` executes the complete reviewed deployment/bootstrap sequence in the local Foundry VM with chain ID 84532. It deploys the actual generated routers/modules, original governance contracts, factory proxy, all oracle adapters, five mock tokens, faucet and four pools. Source observations, prices, source block numbers, accounts and three explicit trading sessions are clearly marked test fixtures. These fixtures establish contract behavior, not the availability or freshness of actual Base mainnet data.

The scenario accesses no RPC, environment file, real private key, public deployment manifest, broadcast API or recurring updater. The original two-day governance timelock, one-day minimum protected withdrawal delay, 28-day protector unlock, corporate-action pause, one-hour stock-opening price freshness and ten-minute relay receipt expiry remain enforced. Token wallet identities are explicitly tAAPLc/tNVDAc/tMETAc/tGOOGLc and TestUSDC, with names such as Test Apple (Base Sepolia); the deployment manifest separately retains each canonical source symbol.

## Configuration corrections found by the rehearsal

The ERC4626 adapter must receive the inner ChainlinkOracleFeed as its underlying price oracle. Supplying CompositeOracle caused its constructor to revert because CompositeOracle does not implement the required decimals getter. The deployment script now uses the same constructor dependency as the original deployment. The script also explicitly enables the required source-sequencer relay on the ERC4626 adapter, before its configuration ownership transfers to the factory.

These changes alter the deployment recipe. The earlier unsigned 123-step preparation is stale; generate a new plan before any broadcast. The corrected sequence includes two additional ERC4626 sequencer configuration writes.

## Stateful scenarios

1. Complete bootstrap and governance wiring: sole governor timelock roles, renounced deployer admin, atomic proxy initialization, immutable implementation slots, finalized factory ownership, permanent source mappings, correct stock wrapper routing, strict TestUSDC backing, four creation bonds, pool seeds, receipt NFTs and faucet reserves. Oracle total-return prices are not multiplied by the corporate-action multiplier a second time.
2. Faucet claims, user deposits on both sides of all four pools, immediate same-token shield exits, rejected early protector exits and successful complete withdrawals after the original unlock period; pool balances and receipt cleanup are checked.
3. A fresh observation during a closed session still rejects a new shield position without spending tokens.
4. Refreshing receipt time while keeping an old source round does not bypass the tighter stock-opening freshness check.
5. Expired relay observations block deposit and pool creation before spending user tokens.
6. Finalized governance prevents deployer configuration bypasses, raw-oracle stock routing and implementation upgrades.
7. Corporate-action pause blocks stock pricing while the valid strict TestUSDC path remains available.
8. A new fixture source round with a 50% drawdown allows protected USDC settlement only after the original one-day delay. All four locked values, backing deductions, receipt cleanup, forfeited stock commissions and protector reward claims are checked.

## Deployment-mechanics checks

`scripts/deploy-base-sepolia.test.mjs` separately verifies unsigned preparation, deterministic recovery after uncertain submission, rejection of unknown pending transactions, exact compiler library linking, runtime code verification with only declared immutable masking, Solidity library self-address patching, exclusive deployment locks, persisted-calldata tamper rejection and duplicate preparation-step handling. These mocked tests do not send network transactions.

## Reproduce

```sh
forge test --root contracts --match-path 'test/base-modules/BaseSepoliaDeploymentRehearsal.t.sol' --offline --extra-output storageLayout
node --test scripts/deploy-base-sepolia.test.mjs
node scripts/verify-base-modules.mjs
```

The rehearsal exercises the same contracts, constructors and configuration sequence as the JavaScript deployment recipe, but is not an execution of that JavaScript script against a public network. Actual source availability, RPC behavior, network fees, receipt confirmations and live activation conditions still require the read-only preparation and the guarded public deployment process. This bounded review and regression coverage are not an independent professional security audit.
