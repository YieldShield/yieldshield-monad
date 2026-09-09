# YieldShield on Monad

A Monad testnet application for holding crypto exposure with two exit choices: withdraw the remaining asset after gain-sharing fees, or surrender the position for its eligible backing payout. Junior providers supply first-loss backing and receive a share of realized gains.

- App: https://monad.yieldshield.ai
- Read-only API: https://monad-api.yieldshield.ai/health
- Network: **Monad testnet, chain 10143**. All demonstration tokens have no monetary value.
- Operator: Hawig Ventures UG (haftungsbeschränkt), Germany.

## Current release status — 9 September 2026

The frontend and API are deployed. The new Monad contracts and interface are implemented, but the on-chain rollout is **incomplete**: 20 contracts / 30 confirmed deployment steps, with the pool modules and funded markets still pending additional testnet MON. Authenticated Pyth access is also pending. The UI exposes actual readiness and does not replace an unavailable MON reference with a scenario price.

**This is not yet a submission-ready release.** See [readiness and submission packet](docs/METROPOLIS_SUBMISSION.md), [build ledger](docs/BUILD_LEDGER.md), and [deployment verification](docs/evidence/deployment-verification.json). The public demo video and external walkthroughs have not been completed. Source publication awaits the owner's explicit approval.

## Product scope

| Market | Assets and price | Implementation / activation |
| --- | --- | --- |
| WMON → TestUSDC | Native MON wrapper; Pyth MON/USD | Implemented; activation pending |
| shMON → TestUSDC | Official shMonad testnet token; delayed withdrawal NAV × MON/USD | Implemented; activation pending |
| WMON → vTestUSDC | Redeemable shares of an explicitly funded test vault | Implemented; activation pending |
| sMON-demo → TestUSDC | Isolated synthetic price cycle | Implemented; deployment pending |
| sMON-demo → vTestUSDC | Same isolated scenario with share-denominated backing | Implemented; deployment pending |

TestUSDC is issued for this demonstration; it is **not Circle USDC**. The YieldShield WMON wrapper is a deployment-specific test wrapper, not a claim to be Monad's canonical WMON. sMON-demo is unrelated to Kintsu sMON. Scenario exchange prices are not live exchange quotes. shMON redemption NAV is not an executable sell price; unstaking has its own completion epoch.

Fees are 10% junior + 1% creator + 1% protocol **of realized positive gains**, paid in the protected asset. There is no recurring protection premium, fixed expiry or promised junior APY. A backing exit surrenders the entire remaining position; it is capped in native backing units. Previously paid gain-sharing fees are not refunded by a later loss. Test pools use 150% collateral, a 60-second protected-exit delay and a 120-second junior notice; notice maturity does not release reserved backing.

## Run locally

Use Node **24.14.0** and Foundry **v1.8.1**. Clone submodules recursively:

```sh
git clone --recurse-submodules git@github.com:YieldShield/yieldshield-monad.git
cd yieldshield-monad
nvm use
npm ci --ignore-scripts
npm run start:api
```

In another terminal run `npm run dev`. Open http://localhost:5174. The service needs only public RPC access for normal reads. Set `PYTH_API_KEY` on the API server to enable fetching authenticated signed updates. Never put that key, or a wallet key, in a browser environment variable.

```sh
npm run test:monad
npm run test:web
npm run build
forge test --root contracts --match-path 'test/monad/*.t.sol'
forge test --root contracts --match-path 'test/base-modules/*.t.sol'
```

The service/deployment tests include a temporary local HTTP listener. Contract tests execute locally and do not spend tokens. The imported Base regressions are preserved and are not counted as new Monad inventions.

## Repository map

- `apps/monad-web/`: active React/Vite app, Monad theme, wallet checks and transaction flows.
- `services/monad/`: active read-only API, bounded RPC reads, verified registries and signed-price delivery.
- `contracts/contracts/monad/`: new wrapper, Pyth/LST adapters, scenario contracts, vault and testnet initializer.
- `contracts/contracts/base-modules/`: imported immutable protocol modules; retained names show provenance.
- `contracts/test/monad/`: new/adapted Monad integration tests.
- `config/`: explicit network identity plus generated ABIs and deployment registry.
- `scripts/*monad*`: preparation, sequential deployment, verification and public journey evidence.
- `apps/web/`, other services and prior-chain scripts: imported historical foundation, not the active Monad deployment.

See [architecture and asset decisions](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md), [new-work disclosure](docs/HACKATHON_DELTA.md), [provenance](docs/PROVENANCE.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

## Deployment and evidence

Follow [the release runbook](docs/OPERATIONS.md). Deployment commands require an explicit `--broadcast`, a dedicated ignored testnet signer file, and chain 10143. Requests and expected hashes are saved before broadcasting. An interrupted deployment resumes the exact intent; it does not replace an ambiguous nonce. No backend service has a wallet private key.

Only publish `config/deployment.json` after `npm run verify:monad` succeeds. Verification of an incomplete manifest does not establish full application readiness. Public journey evidence will be generated only after real confirmed transactions and recipient balances have been checked.

## License and attribution

New YieldShield code is MIT. Imported files retain their applicable license; the included TWAP source is GPL-2.0-or-later. Read `LICENSE`, `THIRD_PARTY_NOTICES.md` and dependency licenses before redistribution. This is an experimental testnet build with internal tests, not an independently audited production release.
