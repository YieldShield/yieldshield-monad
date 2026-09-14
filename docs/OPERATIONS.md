# Monad release runbook

## Environments

| Component | Destination |
| --- | --- |
| GitHub | `YieldShield/yieldshield-monad`, branch `main`; currently private |
| Vercel project | `yieldshield-monad`, team `noc2-6281s-projects` |
| Frontend domain | `monad.yieldshield.ai` |
| Railway project | `YieldShield Monad` / `37575fd4-8fdb-49dd-9bee-eaa9b5cf98c7` |
| Railway service | `monad-api` / `511f2540-1d13-4690-a639-6d6975d3c810` |
| Railway environment | production / `53dfccd8-7a1b-49f8-8699-ac31705a14ce` |
| API domain | `monad-api.yieldshield.ai`, port 3001 |
| Blockchain | Monad testnet 10143, never mainnet 143 |

The frontend rewrites `/api/*` to the Railway API. Railway has its own Node 24 Docker build and a read-only `/health` endpoint. DNS is managed in the existing Vercel zone. The API CNAME and Railway ownership TXT are configured; HTTPS was checked successfully on 9 September 2026.

## Remaining activation inputs

1. The official faucet supplied another 5 valueless testnet MON on 14 September. The dedicated deployer `0xA437345Be29EC6802024A8e090E34b621b92E5E2` then held `5.996506812` MON. The base deployment's cumulative fee reservation is now 9.8 MON, reflecting 10 MON received in total and retaining the reserve checks. Another 10 testnet MON would meet the previously requested funding target for the remaining deployment and journeys; read the current balance before resuming. Do not use mainnet MON.
2. Complete Pyth Terminal sign-in and provision `PYTH_API_KEY`. The API must have a current account/plan that remains usable through the judging period. Creating paid subscriptions requires an explicit owner decision.
3. Approve public source publication after reviewing the final payload. This is separate from hosting the app.

## Resume the deployment

Signing material is in ignored `contracts/.env.monad.local` with mode 0600. Required names are `MONAD_DEPLOYER_PRIVATE_KEY`, optional `MONAD_RPC_URL`, and `PYTH_API_KEY` for reference activation. Never copy the signing key to Vercel, Railway, GitHub Actions or a submitted document.

```sh
.tools/foundry/forge build --root contracts
npm run deploy:monad:prepare
```

Use the locally pinned Monad-capable Foundry 1.8.1; an unrelated globally installed Forge may reject `network = "monad"`. Review the generated local plan and fund the dedicated testnet signer. The initial 4.8-MON cumulative maximum-fee cap stopped the partial rollout; it was raised to 9.8 after the second 5-MON faucet transfer was confirmed. Only raise the base recipe's cumulative cap and its `feePolicy` summary to 19.8 after the remaining requested funds arrive; retain the per-transaction cap and reserve checks. This is a conservative maximum-fee reservation, not an expected bill. Then:

```sh
npm run deploy:monad
npm run verify:monad
npm run sync:monad
npm run deploy:reference
npm run verify:monad
npm run sync:monad
```

The reference recipe creates an isolated factory and three markets only after valid Pyth updates are available. Scenario deployment has two markets. Both seed actual test backing. The existing manifest is the source of truth; do not delete it to “fix” a failed or ambiguous transaction. A changed intent, unknown nonce, reverted receipt or runtime mismatch requires investigation.

## Validate real journeys

```sh
npm run smoke:monad
npm run smoke:reference
```

These are broadcasts, not unit tests. They use the dedicated testnet account with a separate 3-MON maximum fee/value reservation per journal. They cover scenario purchase, funded vault conversion, senior deposit/partial exit/full asset exit/backing exit, junior deposit/claim/notice/withdrawal, and reference wrapping/staking. They wait for the real configured delays and preserve exact hashes if interrupted. Transaction parameters with deadlines are frozen; do not silently replace an expired signed transaction. Review its known receipt and journal before a new run.

Evidence is written to `docs/evidence/*-journey.json` only on successful completion. Receipt-time balance deltas establish received tokens. Deployment verification also checks pool wiring and receipt NFT runtime/ownership. A shMON staking transaction does not establish completed unstaking: demonstrate that external epoch-based queue separately in the wallet, and only claim completion after its actual receipt.

## Publish application revisions

Run the tests in README, then verify/sync the chain registry and commit that stage. GitHub Actions checks the app, API, receipt tooling and contract suites. Railway is connected to the repository's `main` branch and rebuilds the API for its configured watched paths.

```sh
vercel pull --yes --environment=production --scope noc2-6281s-projects
vercel build --prod --scope noc2-6281s-projects
vercel deploy --prebuilt --prod --yes --scope noc2-6281s-projects
```

Set the Pyth key as a Railway secret, with no command output that prints its value. Verify `/api/status`, price freshness, actual market addresses, a wallet journey and signed-out access to the public app. Liveness returning HTTP 200 does not imply that pools or Pyth are ready.

## Demo preparation and refill

Use the official Monad faucet for gas and the app's Test assets faucet for TestUSDC/sMON-demo. The app faucet has a 24-hour account cooldown. Its initial inventory is 5 million TestUSDC and 500,000 sMON-demo; exchange inventory is separately funded. Read actual balances before recording. Existing treasury inventory can refill test token contracts through normal transfers; do not bypass faucet limits or mislabel external assets.

Prepare at least two senior receipts and a junior receipt in advance so the demo can show a matured exit without implying a waiting period was skipped. Record visible network, pool, token symbols and explorer links. Keep the video under three minutes and publish it where signed-out judges can view it.

## Recovery and limits

An API or Pyth outage should show unavailable data and a retry path. No stale data may authorize a new reference position. Do not change a deployed contract's source and expect its old runtime hash to match: deploy a separately identified version if logic must change. Keep existing Base/Robinhood infrastructure isolated. This testnet build is not approval to accept production funds.

Owner decision, 9 September 2026: keep the repository private for now. Do not change its visibility without a later explicit instruction. Public source remains a requirement before final Metropolis submission.
