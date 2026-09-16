# Sponsor release — 16 September 2026

[PR #31](https://github.com/YieldShield/yieldshield-monad/pull/31) merged as `deb536fbb7ab7ce6b814a16d076b363de315a842` after the full release checks, Git history secret scan, dependency exposure gate and Vercel preview passed. All implementation and fix commits were preserved.

Vercel deployed `dpl_4SNipBNa9PasCjd27Jmu8BLGcXRk` to [monad.yieldshield.ai](https://monad.yieldshield.ai). Railway deployed `1bd3ccff-25ae-404c-b56f-1daf5e3d6514` to the existing API. No protocol contract redeployment was required.

## Verified behavior

- Production verified all 44 contract identities and reported seven ready pools and six healthy asset sources. The first measured status response took 6,964 ms; this is one observation, not a latency guarantee.
- The [Dynamic browser journey](DYNAMIC_BROWSER_CHECK.md) completed wrapping, protection, reload recovery and withdrawal through an external MetaMask wallet. The closed receipt disappeared from the position API.
- Optional [Kuru funding](KURU_INTEGRATION.md) appears under Faucet. Five canonical scripted transactions verified the swap and withdrawal, using 0.2121651 test MON in actual gas fees. A separate browser funding test is awaiting wallet confirmation; it is not reported as completed.
- The [official CRE simulation](CHAINLINK_CRE.md) passed at block 63063880: both AUSD pools and all three configured feeds matched the API, with no alerts. This is a successful local simulation using live capabilities, not a DON deployment or continuous monitor.
- Envio is intentionally **not configured** pending permission to create its free API token. Its activity panel is hidden after this status loads; wallet balances, positions and pool actions continue to use verified RPC state. No paid package or billing was enabled.

Exact deployment and endpoint results: [production evidence](evidence/sponsor-production-release-20260916.json).

## Review corrections

Separate commits fixed malformed activity timestamps, rollback-guard validation, partial-withdrawal history, partial-withdrawal receipt verification, stale Kuru confirmations, inactive-feature presentation and Vercel's shared-module packaging. Independent agent reviews found no remaining blocking issue in the reviewed sponsor paths. This is internal review, not a professional protocol audit.

Two existing Dynamic transitive dependency alerts remain documented exceptions. The dependency gate verified that the affected native bigint-buffer and stream-json modules are absent from the browser bundle; API and contract production dependency audits were clean. This does not imply the installed dependency graph has zero alerts.

## Submission work still open

Record and upload the live technical demo and founder pitch to accepted video hosts; test with people outside the team; complete the optional sponsor evidence gaps above; and recheck the final form when it opens on 22 September. Start with the [judge quickstart](JUDGE_QUICKSTART.md), [founder pitch guide](FOUNDER_PITCH_GUIDE.md) and [market-validation plan](MARKET_READINESS_2026-09-16.md). No external interviews, customer traction or final submission are claimed.
