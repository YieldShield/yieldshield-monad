# Restoring the canonical Monad MON reference

The five WMON/shMON reference markets use RedStone's canonical Monad testnet MON push feed. On 11 October 2026, its last accepted observation was still 23 September, 12:55:42 UTC. The 120-second application freshness bound remains unchanged. The owner does not yet have RedStone gateway access, so these markets remain unavailable until a current authentic update is delivered. The two isolated scenario markets are separate demonstrations.

## Recovery supported by this change

The existing adapter accepts `updateDataFeedsValuesPartial([bytes32("MON")])` from any sender when the appended package contains valid provider signatures and a valid timestamp. This was verified by replaying [the last successful public update](https://testnet.monadexplorer.com/tx/0xc7ce967bca33af0ff9ac0ddf13692e1cd4b9d020e4bfc6dd547842a98b65e1da) with `eth_call` from an unrelated sender at the preceding historical block. The newly implemented serializer and preparation pipeline also passed that historical replay with the exact original signed package bytes. The same old observation is rejected at a current block. [Validation record](evidence/redstone-recovery-validation-20261011.json).

A gateway credential and current signed MON packages are therefore sufficient to prepare an update for the user's existing wallet; a provider-only relayer role or protocol governance change is not required. A wallet confirmation and testnet gas are still required to publish it. No signing key is added to the API, and no unattended updater is deployed. The wallet checks the original strict price getter after confirmation. An update does not guarantee that every other pool or transaction condition is satisfied.

## Configure access

Request permission for **MON / redstone-primary-demo** using the [API-key form linked by RedStone](https://docs.google.com/forms/d/e/1FAIpQLSd1FyV0TLXjRtpor8_LbhdrdYimmgMrb_cK0FZ1xc8EGceIPg/viewform). It requests a contact email, company, feeds and Telegram handle. This work did not submit that form or contact the provider.

Store the issued key as `REDSTONE_API_KEY` in the **Monad API server's secret environment**, then redeploy or restart that API. Do not put it in a Vite variable, frontend code, a URL, Git, logs or the hackathon form. The only gateway permitted by this implementation is `https://oracle-gateway-api.b.redstone.finance`; other endpoints require an explicit integration review. The browser uses the application's API.

The API's `redstoneUpdateConfigured` field means only that a key is present. It does not mark the oracle or markets healthy. A missing key produces a specific HTTP 503 response, and rejected access remains disabled. After configuration, use the application's MON-reference update action and confirm the wallet request. Refresh the market state and perform a new strict price check before acting. If the owner pauses too long during signing, obtain a new observation; never extend its expiry or bypass a stale-price rejection.

## What the API and wallet verify

`GET /api/redstone-update` prepares a public unsigned payload. It checks:

- Monad testnet chain 10143; pinned proxy bytecode and implementation slots/code hashes for both the MON feed and its adapter; source description, decimals, MON feed ID and source-to-adapter relationship.
- The original two-signer threshold and all five pinned provider signer indexes. Every supplied signature is independently recovered with the existing viem cryptographic implementation. Duplicate or untrusted signers, altered data, missing or duplicate feeds, malformed base64, numeric precision loss and mixed timestamps are rejected.
- Bounded gateway responses, package counts, point counts and serialized payload size. The gateway key is sent only in an `x-api-key` header, redirects are disabled, and upstream bodies/headers are never returned on errors. Successes and failures share a dedicated two-second cache, including pending work, so visitors cannot make the service exceed the documented one-request-per-second key budget on a single API instance. Multiple API instances must share a gateway cache/rate budget before scaling this route.
- The exact call to the pinned adapter, restricted to MON and zero native value, by canonical `eth_call`. An observation already published on-chain is not offered as a new update. Network or verification errors stop preparation.

The response contains `chainId`, `provider`, `adapter`, `source`, `feedId`, `publishedAt`, `price`, two recovered `signers`, a serialized `payload`, `expiresAt` and `verifiedAtBlock`. `payload` is only the RedStone trailer. The wallet constructs the fixed MON-only function call, verifies its own target and source pins, checks bounded response fields, simulates again, and requests the user's signature through the existing confirmation flow. No approval or native transfer is part of publishing this update.

Packages must be at most 30 seconds old when issued, with at most five seconds of future clock skew. The review window is at most 30 seconds and never later than 90 seconds after the observation. Direct read-only checks of the deployed adapter confirmed its maximum past age of 180 seconds and future offset of 60 seconds; the preparation policy is stricter. The separate 120-second application price bound is unchanged. Each later action requires fresh state; one update is not continuous oracle operation.

## Gateway wire compatibility

The [current official SDK request implementation](https://github.com/redstone-finance/redstone-oracles-monorepo/blob/main/packages/sdk/src/fetch-data-packages.ts) uses `/v2/data-packages/latest-by-data-feeds/redstone-primary-demo?dataFeedIds=MON` and indexes the response by requested feed (`MON`). Individual packages can carry a `dataPackageId` of `___FAST___`; that label is not a signed field. All signed data points are retained, including other assets in a multi-point package, while the on-chain update selector remains MON-only. Numeric eight-decimal values and canonical base64 byte values match the official schema.

The small serializer implements the published RedStone wire format using existing viem primitives, without adding the SDK's unused signing/native dependencies. Its golden fixture was reconstructed with the official protocol decoder from authentic public transaction calldata. Tests prove identical original signed bytes, both numeric/base64 forms, and complete multi-point packages. They do not claim a successful current authenticated gateway response: that final compatibility and live update check requires the owner's issued key.

Sources: [current official Monad manifest](https://github.com/redstone-finance/redstone-oracles-monorepo/blob/main/packages/relayer-remote-config/main/relayer-manifests-multi-feed/monadTestnetBoltMultiFeed.json), [authenticated gateway instructions](https://docs.redstone.finance/docs/stage1-market-data/price-feeds/pull-model/#authenticated-gateways), [push-relayer model](https://docs.redstone.finance/docs/stage1-market-data/price-feeds/push-model/#relayer).

## Prepare without broadcasting

For a terminal review with `REDSTONE_API_KEY` already configured in the process environment:

```sh
node scripts/prepare-redstone-update.mjs --output artifacts/local/redstone-update-review.json
```

The script saves an unsigned transaction and expiry only after verification and simulation. It never signs or broadcasts, accepts no private key, and fails explicitly if access is absent. A saved review expires quickly and must not be reused after its deadline.

Validation on 11 October: 24 focused RedStone tests passed; the full Monad API/deployment-helper suite passed 159 tests, including the new missing-access HTTP check. The historical RPC replay and its limits are recorded above. No current feed recovery, new wallet transaction or mainnet oracle integration is claimed by those tests.
