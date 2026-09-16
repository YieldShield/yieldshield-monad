# Monad deployment recheck — 15 September 2026

## Scope

Follow the visitor journey from Faucet and wallet selection to trade, protection, liquidity and position exits. Check the API and its external RPC boundary, registry identity, deployed code, receipts, pricing, funding and browser rendering. Preserve the private repository and the testnet-only boundary.

## Confirmed issues and separate commits

| Commit | Fix | Evidence |
| --- | --- | --- |
| `b66c8dc` | Stop a transaction sequence after the selected wallet changes | Selection revision tests cover account/connector changes and stale continuations. |
| `9f713cb`, `edd1059` | Retain pending transaction hashes when browser storage fails; preserve cross-tab checks | Failed/quota-blocked storage no longer discards an unconfirmed hash in the current page. Reload persistence still requires working browser storage. |
| `a71f9c4`, `4d0b456` | Keep a trade bound to the reviewed quote expiry across approval | Expiry is checked before and after approval; the swap uses that original deadline. No fresh deadline is granted to an old quote. |
| `bc5ceb8`, `571daa1` | Check gas and bond-token funding before pool creation | Empty bond balances link to preparation; insufficient balances disable approval. |
| `14ec559` | Retry the public RPC's specific read rate-limit error | HTTP 200 carried code -32011, “requests limited to 15/sec”. Only rejected reads retry, twice, preserving exact parameters and block. Semantic errors and broadcasts never retry; no stale fallback. |
| `098b345` | Apply the same narrow retry to deployment verification | The previous verifier failed on that same rate limit; the corrected verifier completed all identity checks. |
| `0e3a518` | Show snapshot loading errors on position detail pages | An API status error is surfaced even if the positions request itself did not fail. |
| `35d9a7f` | Handle the same rate limit in browser reads | Reduce batch size 20→10 and retry only eligible reads; never repeat signatures or broadcasts. Ten mocked transport regression cases. |
| `8dcee07` | Correct provider value in the exit calculator | At +25% asset / +2% backing, provider value is $177.50, not $178. Creator/protocol fees receive $0.50; $100+$177.50+$0.50 conserves the $278 combined value. Confirmed against the deployed BasePoolShieldExitModule. |

## Verification completed

- 69 API/deployment tests, 77 frontend tests and production builds pass locally. The initial API test attempt was blocked by sandbox port permissions; rerunning with temporary local-server permission passed all 69.
- Pinned Foundry: 23 Monad lifecycle/adapter tests and 225 inherited module regressions pass, with no failures/skips.
- Fresh [deployment verification](evidence/deployment-verification.json): all 39 named contracts, 5 pools and 10 receipt NFTs match runtime, source, wiring and canonical receipts. The report was committed separately as `a87423b` only after complete success.
- At block 62,765,943 all 5 pools were unpaused with unreserved backing. Every receipt NFT was owned by its pool. Faucet balances were 5,000,000 TestUSDC and 500,000 sMON-demo, with 10,000/25 claims and a 24-hour cooldown. WMON supply 0.11 was backed by exactly 0.11 native MON.
- shMON's address matches the [official testnet deployment](https://docs.shmonad.xyz/addresses/); staking/unstaking preview and pending-request reads succeed. The dedicated test account had no pending unstake.
- Browser checks: live navigation, the pool creation screen, calculator pointer controls, evidence route, and local updated Protect/Faucet/create-pool forms. Zero deposit input shows a validation error; disclosures and preparation links render their controls; no console errors on the clean local check. The corrected calculator shows $201.02 provider value at +49% asset/+2% backing locally. The live release also shows the expected $177.50 at +25% asset/+2% backing. Demo video and transcript return HTTP 200 with the correct content types.
- Controlled API before/after: before, ready-pool counts were [5,3,4,4,2,3,5,2], with 28 rate-limited methods. After, all 8 snapshots had 5 ready pools even though 18 initial rate-limit responses needed retries. This demonstrates the captured failure recovery under that bounded sample, not permanent availability.

## Release

Railway automatically deployed commit `35d9a7f` (including the API fix) as `bab25646-09da-4345-9f03-57a284568a66`; deployment reported SUCCESS. Production sampling through the Vercel `/api/status` rewrite passed 8/8 requests between 14:21:09 and 14:23:39 UTC: all 39 code checks, all 5 ready/unpaused pools and fresh RedStone. Reference age was 6–12 seconds on arrival. Warm requests took 5.84–6.19 seconds; cold/code-refresh requests took 11.15–11.52 seconds. Compact evidence is saved locally at `artifacts/local/hosted-api-after-retry.json`.

The frontend was built from `8dcee07` and deployed to [monad.yieldshield.ai](https://monad.yieldshield.ai/) as `dpl_C97tZo5eQhrzDeQiiq4TidnXUoPc`. [The full release checks passed](https://github.com/YieldShield/yieldshield-monad/actions/runs/34981040829): 69 API/deployment tests, 77 frontend tests, 23 Monad contract tests and 225 inherited regressions (394 total), plus build and script checks. The live creation form includes funding guidance and renders without console errors.

## Limits requiring actual wallet execution

No new signatures or transactions were submitted during these audits. The historical journals still establish 28 successful scenario transactions and 32 successful reference transactions, plus the preserved failed shMON exit and reviewed retry, on 14 September. They do not prove the current Dynamic browser signing flow or completed shMON unstaking.

A user sign-in was requested to complete those interactive checks. The visible user tab still showed Connect wallet at the latest check. Do not state that every signed flow is verified until there is an actual successful receipt, including the external unstaking epoch wait. Testnet only. The repository was private at this check; [source publication followed on 16 September](PUBLICATION.md).
