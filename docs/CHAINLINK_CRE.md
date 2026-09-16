# Chainlink CRE pool health workflow

YieldShield’s CRE workflow checks whether the application is showing the same pool backing and oracle state that exists on Monad. A cron trigger combines a live HTTP snapshot with independent EVM capability reads, then produces a machine-readable health report. It never signs a transaction, moves funds, changes pool state or substitutes a new price feed.

## What it monitors

The committed configuration covers the WMON/AUSD and shMON/AUSD pools on **Monad testnet (10143)**. Contract and feed addresses match `config/deployment.json` and are checked by a regression test.

1. Fetch the public YieldShield `/api/status` endpoint using CRE’s HTTP capability. Validate the chain, known pool assets, known feed addresses and response size. Reduce the response before consensus.
2. Use CRE’s EVM capability to read the API’s claimed block header. Reject nonexistent, mismatched, future or stale blocks.
3. At that exact block, read both pools’ backing balances, reserved backing and paused state. Independently read the WMON, shMON and AUSD feeds’ prices and stale flags.
4. Compare those values with the API. Flag mismatches, stale or future oracle observations, empty/low free backing, paused pools and reservations exceeding backing.
5. Return a JSON report with the block, pool observations, oracle observations and alerts. Emit a concise log plus one line per alert.

The workflow uses **one HTTP request and 13 EVM reads**. It does not need a paid external API, a wallet key or gas. AUSD is a testnet unit-priced asset; its feed does not claim a live dollar-market observation. WMON/shMON publication timestamps are checked independently. Free backing is calculated in the backing token’s integer units and is **not** a deposit quote, solvency audit or promise of a payout.

## Run it

Prerequisites: Bun, the official CRE CLI, and a Chainlink account authenticated with `cre login`. This integration is isolated from the web/API dependency trees. Versions used for implementation: CRE CLI 1.34.0, Bun 1.4.2, CRE TypeScript SDK 1.21.1. `bun.lock` pins the dependency tree.

```sh
cd integrations/chainlink-cre/pool-health
bun install --frozen-lockfile
bun run typecheck
bun test

cd ..
cre login
cre workflow simulate pool-health --target monad-testnet --non-interactive --trigger-index 0
```

Do not add `--broadcast`: this is a read-only workflow. The CLI may print that it uses a default simulation private key; this workflow does not request EVM writes or need access to YieldShield’s deployment key. Build output, environment files and credentials must stay out of Git.

The optional schedule (`0 */5 * * * *`) expresses a five-minute interval **if later deployed**. A successful local simulation does not create an ongoing monitor or deploy to a Chainlink DON. Deployment requires separate account/network access and an explicit operational decision. For hackathon submission, keep the successful official simulation output as evidence; do not describe the workflow as production-deployed unless it has been deployed and verified.

## Failure and trust boundaries

- Every EVM comparison uses the same explicit block as the API snapshot. Reads at unrelated moving blocks would create false mismatches.
- The block timestamp comes from the RPC header and must match the API claim. Snapshots older than 120 seconds fail closed.
- Offchain observations must pass CRE identical-value consensus. If nodes see different API snapshots around a cache refresh, consensus can fail; the execution must be retried, never presented as healthy.
- HTTP failures, malformed data, reverted oracle reads and unavailable blocks fail the execution rather than fabricate a healthy fallback.
- Contract/feed addresses are fixed in reviewed configuration. The API cannot choose an arbitrary contract or external request destination.
- The API’s broader bytecode-verification flag is propagated when false, but this small workflow does not independently audit every deployed bytecode hash.
- Monitoring is advisory. It is not connected to transaction permissions or automatic pausing. A report is an observation at a named historical block, not a guarantee of current state.
- There is no outgoing alert webhook or notification service configured. The report and CRE execution logs are the output; no team/user data is sent to a third-party destination.

## Testing

The test suite covers matching observations; over-reservation; low or empty backing; paused pools; stale, zero and future oracle observations; API verification failure; wrong-chain/asset/feed responses; malformed integers; stale/future/mismatched blocks; bounded configuration; and drift from the deployment registry. An additional test runs the official SDK test runtime to verify the HTTP → 13 same-block EVM-read → report orchestration, plus an HTTP-failure test.

## Verification status

As of 16 September 2026, the workflow passes type checking, 14 tests (including the official SDK runtime harness), and dependency audit. The official CLI compiles the WASM and starts the cron trigger. A successful live simulation has not yet been recorded: the current public status endpoint can exceed the CRE HTTP capability’s 10-second deadline on a cold cache. The application API performance fix must be deployed and the simulation repeated before claiming the bounty’s execution requirement is met.

## Sponsor submission

The integration is intended for [Best Workflow with CRE](https://hackathon.monad.xyz/tracks/best-workflow-with-cre): it orchestrates an external API and a blockchain using the actual CRE SDK and capabilities. Include the workflow source, reproducible command, successful CLI simulation evidence and a short explanation of a detected failure case. Bounty selection or source code alone is not proof of qualification.

Official references (checked 16 September 2026):

- [Supported networks](https://docs.chain.link/cre/supported-networks-ts): Monad testnet requires CLI 1.30+ and TypeScript SDK 1.19+; tenant availability should also be checked with `cre workflow supported-chains`.
- [Simulating workflows](https://docs.chain.link/cre/guides/operations/simulating-workflows): authenticated CLI simulation compiles WASM and calls real APIs and RPCs.
- [EVM reads](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-read-ts) and [HTTP requests](https://docs.chain.link/cre/guides/workflow/using-http-client/get-request-ts).
- [Service quotas](https://docs.chain.link/cre/service-quotas): keep observations and capability calls bounded.

The SDK includes chain-family support packages, including Solana codecs, as its own dependencies. They are restricted to this isolated workflow toolchain and are not added to the Monad application or API bundles.
