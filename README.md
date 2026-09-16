# YieldShield on Monad

A Monad testnet application for holding crypto exposure with two exit choices: withdraw the remaining asset after gain-sharing fees, or surrender the position for its eligible backing payout. Junior providers supply first-loss backing and receive a share of realized gains.

- App: https://monad.yieldshield.ai
- Read-only API: https://monad-api.yieldshield.ai/health
- Network: **Monad testnet, chain 10143**. All demonstration tokens have no monetary value.
- Operator: Hawig Ventures UG (haftungsbeschränkt), Germany.

## Current release status — 16 September 2026

The chain rollout is complete: **44 named contracts and seven funded pools**, with scenario, reference and expanded AUSD journeys verified against canonical receipts and recipient balances. The original five pools were initially seeded with 50,000 valueless backing units each. The two new AUSD pools each received 2,000 test AUSD after a 500-AUSD creation bond. RedStone MON/USD is read directly on chain with a 120-second freshness limit; the historical Pyth adapter remains attributed but is not used by the active reference factory. Dynamic email authentication and embedded wallets are configured in a separate Monad sandbox environment.

**This is not yet a submission-ready release.** See [readiness and submission packet](docs/METROPOLIS_SUBMISSION.md), [build ledger](docs/BUILD_LEDGER.md), and [deployment verification](docs/evidence/deployment-verification.json). The [asset expansion release](docs/ASSET_EXPANSION_RELEASE.md) records the deployed AUSD integration and its verification. A [2:08 narrated product overview and product guide](https://monad.yieldshield.ai/how-it-works) are available. Dynamic browser signing and external walkthroughs remain outstanding. Source publication awaits the owner's explicit approval.

## Product scope

| Market                | Assets and price                                                 | Implementation / activation |
| --------------------- | ---------------------------------------------------------------- | --------------------------- |
| WMON → TestUSDC       | Native MON wrapper; RedStone MON/USD                             | Deployed and funded         |
| shMON → TestUSDC      | Official shMonad testnet token; delayed withdrawal NAV × MON/USD | Deployed and funded         |
| WMON → vTestUSDC      | Redeemable shares of an explicitly funded test vault             | Deployed and funded         |
| WMON → AUSD           | Native MON wrapper; official Agora testnet backing              | Deployed and funded         |
| shMON → AUSD          | Official shMonad testnet token; official Agora testnet backing   | Deployed and funded         |
| sMON-demo → TestUSDC  | Isolated synthetic price cycle                                   | Deployed and funded         |
| sMON-demo → vTestUSDC | Same isolated scenario with share-denominated backing            | Deployed and funded         |

TestUSDC is issued for this demonstration; it is **not Circle USDC**. The YieldShield WMON wrapper is a deployment-specific test wrapper, not a claim to be Monad's canonical WMON. sMON-demo is unrelated to Kintsu sMON. Scenario prices follow synthetic formulas. shMON redemption NAV is not an executable sell price; unstaking has its own completion epoch. AUSD is the official Agora **testnet** token, with a test-unit valuation policy; it is not a redeemable real-dollar balance.

The asset catalog also contains Monad mainnet syrupUSDC, sUSDe, USDe, earnAUSD, Kintsu sMON, wstETH and weETH. These are **research entries only**, not selectable testnet assets. Holding USDe alone does not earn staking yield. See [asset research and activation gates](docs/YIELD_ASSET_RESEARCH.md).

Fees are 10% junior + 1% creator + 1% protocol **of realized positive gains**, paid in the protected asset. There is no recurring protection premium, fixed expiry or promised junior APY. A backing exit surrenders the entire remaining position; it is capped in native backing units. Previously paid gain-sharing fees are not refunded by a later loss. Test pools use 150% collateral, a 60-second protected-exit delay and a 120-second junior notice; notice maturity does not release reserved backing.

## Run locally

Use Node **24.14.0** and Foundry **v1.8.1**. Clone submodules recursively:

```sh
git clone --recurse-submodules https://github.com/YieldShield/yieldshield-monad.git
cd yieldshield-monad
nvm use
npm ci --ignore-scripts
npm run start:api
```

In another terminal run `npm run dev`. Open http://localhost:5174. The service needs only public RPC access for normal reads. Active reference markets require no API key. Legacy Pyth tooling remains in the attributed source. Never put server credentials or wallet keys in browser environment variables.

```sh
npm run test:monad
npm run test:web
npm run build
forge test --root contracts --match-path 'test/monad/*.t.sol'
forge test --root contracts --match-path 'test/base-modules/*.t.sol'
```

The service/deployment tests include a temporary local HTTP listener. Contract tests execute locally and do not spend tokens. The imported Base regressions are preserved and are not counted as new Monad inventions.

## Repository map

Start with [the repository guide](docs/REPOSITORY_GUIDE.md) for active components, historical imports and the evidence index.

- `apps/monad-web/`: active React/Vite app, Monad theme, wallet checks and transaction flows.
- `services/monad/`: active read-only API, bounded RPC reads, verified registries and signed-price delivery.
- `contracts/contracts/monad/`: new wrapper, RedStone and historical Pyth/LST adapters, scenario contracts, vault and testnet initializer.
- `contracts/contracts/base-modules/`: imported immutable protocol modules; retained names show provenance.
- `contracts/test/monad/`: new/adapted Monad integration tests.
- `config/`: explicit network identity plus generated ABIs and deployment registry.
- `scripts/*monad*`: preparation, sequential deployment, verification and public journey evidence.
- `apps/web/`, other services and prior-chain scripts: imported historical foundation, not the active Monad deployment.

See [architecture and asset decisions](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md), [new-work disclosure](docs/HACKATHON_DELTA.md), [provenance](docs/PROVENANCE.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

The [Metropolis sponsor strategy](docs/SPONSOR_STRATEGY.md) prioritizes Dynamic onboarding and evaluates Kuru, Agora, Chainlink CRE and other relevant sponsors. Dynamic is implemented and configured; its browser signing evidence is pending. Other sponsor integrations have explicit evidence gates. No bounty eligibility or award is claimed.

## Deployment and evidence

Follow [the release runbook](docs/OPERATIONS.md). Deployment commands require an explicit `--broadcast`, a dedicated ignored testnet signer file, and chain 10143. Requests and expected hashes are saved before broadcasting. An interrupted deployment resumes the exact intent; it does not replace an ambiguous nonce. No backend service has a wallet private key.

Only publish `config/deployment.json` after `npm run verify:monad` succeeds. Verification of an incomplete manifest does not establish full application readiness. The [scenario](docs/evidence/scenario-journey.json), [reference](docs/evidence/reference-journey.json) and [expanded AUSD](docs/evidence/expanded-journey.json) journey files contain confirmed transactions and recipient balance checks; they describe internal testing, not user adoption.

## License and attribution

New YieldShield code is MIT. Imported files retain their applicable license; the included TWAP source is GPL-2.0-or-later. Read `LICENSE`, `THIRD_PARTY_NOTICES.md` and dependency licenses before redistribution. This is an experimental testnet build with internal tests, not an independently audited production release.
