# Envio pool activity

YieldShield uses Envio HyperSync to turn Monad testnet pool events into a readable activity history. Visitors can see deposits, protection payouts, backing withdrawals, withdrawal notices and claimed fees in **Compare pools**. Connected wallets see their own actions in **Your positions**, including closed positions that no longer have a receipt NFT.

Every row links to the actual transaction. This is an event history, not a balance or ownership index. Financial snapshots, transaction simulation and settlement still use verified contract reads.

## Source and pipeline

- Network: Monad testnet, chain **10143**.
- Official endpoint: `https://monad-testnet.hypersync.xyz`.
- Pool scope: the seven deployed addresses in `config/deployment.json`; newly created/custom pools require a registry update before appearing here.
- Start block: **62432610**, the first registered pool's creation receipt (`0x48707ada852eb38752f951008bf113d0f226d20888fbbc5f0d5bf32b498983e1`), recorded in `contracts/deployments/monad-testnet.json`.
- Query and event decoding: `services/monad/envio.mjs` (`activityQuery`, `activityAbi`, `createEnvioActivity`). Public configuration: `config/envio.json`.
- Consumer: `GET /api/activity`, `apps/monad-web/src/Activity.tsx`.

```text
Pool events → Envio HyperSync JSON query → strict ABI decoder
            → bounded shared activity snapshot → API → Markets / Positions
```

The scan fixes an exclusive end block 20 blocks behind the provider's height and follows `next_block` until complete. Responses retain block hash, transaction hash, log index and timestamp. Only registered addresses and known event signatures are accepted. Unknown token metadata, removed logs, duplicate IDs, invalid pagination, conflicting rollback guards or incomplete scans reject the refresh.

Each successful scan replaces the complete previous snapshot. A later canonical scan removes orphaned events instead of retaining them indefinitely. The 20-block delay is an observation lag, not a claim of finalized settlement. This small, read-only hackathon index deliberately uses bounded full rescans rather than a persistent database. A larger rollout should use a durable incremental index with a canonical-block checkpoint.

## Free access only

Use a token on Envio's **Free** HyperSync plan. Do not enable a paid plan, paid overages, HyperRPC billing, or an Envio Cloud deployment for this integration. The official [HyperSync pricing page](https://envio.dev/pricing/hypersync) lists Free at $0/month with fair-use rate limits (checked 16 September 2026).

Set `ENVIO_API_TOKEN` **only on the existing Railway API service**. It must never be prefixed with `VITE_`, added to Vercel's browser configuration, committed, or printed. No new package or external database is required. A missing token returns `not-configured` and never makes an Envio request.

Cost and load controls:

- Refresh only when requested, at most once every two minutes for the whole API process; wallet/pool filters share the same index.
- One in-flight scan; no automatic provider retries or continuously running timer.
- At most one height request and four query requests per scan; eight-second request deadlines.
- At most 60 provider requests per rolling hour and 500 per rolling day, per API process.
- Maximum 2 MiB per response, 10,000 decoded events, and 50 events returned per API response.
- Budget exhaustion or rate limiting leaves the previous history visibly delayed, rather than upgrading or increasing spending.

Request counters are memory-resident and reset on process restart; they are load safeguards, not a provider billing cap. Keep the account on Free and use one API replica. The integration does not manipulate billing or subscribe to anything.

## Public API

```text
GET /api/activity
GET /api/activity?owner=0x...&limit=20
GET /api/activity?pool=wmon-ausd&limit=8
```

`owner` matches the event's actor/recipient. It does not establish current receipt ownership and does not include NFT transfers. Pool IDs are allowlisted from the deployment registry. Limits are integers from 1 to 50; the default is 20. Results are sorted newest first.

The response includes `source`, `chainId`, `status`, `complete`, `observedAt`, `startBlock`, `indexedThrough`, `sourceHeight`, `confirmationBlocks`, `scope`, `poolCount`, `totalEvents`, `hasMore` and `events`. Each event includes the action, pool label, actor, raw amount and token decimals where applicable, receipt ID when emitted, transaction hash, block number/hash, log index and timestamp.

| Status           | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `not-configured` | No server token; no provider requests are made.                    |
| `indexing`       | First scan is in progress. The API responds immediately.           |
| `ready`          | A complete snapshot was fetched successfully within three minutes. |
| `stale`          | A prior snapshot exists but refresh failed or is overdue.          |
| `unavailable`    | No complete snapshot exists and the provider/scan failed.          |

An empty history is shown only with a completed snapshot. Activity failures never disable or enable financial actions. Provider error bodies and credentials are not returned to clients.

## Reproduce and demonstrate

With a Free token in an ignored `.env.envio.local` file:

```sh
node --env-file=.env.envio.local scripts/verify-envio-activity.mjs
```

This fetches real Envio data and independently checks one latest event per registered pool against Monad RPC transaction receipts. It fails unless the index is ready and the receipt's status, block hash, block number, pool address, log index, decoded event, actor and amount agree.

After deploying the API and letting its first scan finish:

```sh
node scripts/verify-envio-activity.mjs --api https://monad-api.yieldshield.ai --out docs/evidence/envio-activity.json
```

For the demo: open **Compare pools**, select an indexed event and its explorer receipt, then connect a test wallet and inspect **Your positions → Your activity**. A new transaction appears after the provider catches up, the 20-block lag and next refresh. Explain that the existing historical activity includes our own development tests; it is not evidence of external adoption or real monetary volume.

Focused automated checks:

```sh
node --test services/monad/envio.test.mjs services/monad/server.test.mjs
npm run test:web
npm run typecheck
```

The tests cover pagination, rollback replacement, cross-page fork rejection, authentic empty history versus outages, token isolation, strict source scope, token decimals, stale results, request/memory bounds and UI presentation. A passing mocked test suite alone is not live sponsor evidence; retain the receipt cross-check output after real verification.

## Official references

- [Monad testnet support and endpoints](https://envio.dev/chains/monad-testnet)
- [HyperSync query, pagination and rollback guards](https://docs.envio.dev/docs/HyperSync/hypersync-query)
- [API tokens](https://docs.envio.dev/docs/HyperSync/api-tokens)
- [Free HyperSync plan](https://envio.dev/pricing/hypersync)
- [Metropolis Envio bounty](https://hackathon.monad.xyz/tracks/best-use-of-envio)
