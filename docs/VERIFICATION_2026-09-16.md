# Final application and security recheck — 16 September 2026

The owner requested an additional end-to-end review, a separate security review, and separate commits for each fix. This record covers the reviewed source, deployed testnet contracts and hosting configuration. It is not an independent audit or a guarantee against undiscovered vulnerabilities.

## Findings and fixes

- **Unbounded API cache:** cached owner queries could retain expired entries indefinitely. The cache now removes expired entries, caps retained work at 256 entries, preserves shared pending requests and returns a controlled 503 when every slot is busy (`e5e656d`).
- **Request-limit hardening:** arbitrary forwarding chains no longer select the caller identity. Direct deployments use the socket peer; Railway HTTPS deployments use its documented edge-provided `X-Real-IP`. The limiter retains at most 10,000 active windows without clearing existing quotas at capacity (`094dbb4`). Railway's live header sanitization was not independently probed, so this is not evidence of a demonstrated production bypass. Vercel-proxied clients can share an egress-IP quota.
- **Contract tooling:** the local Foundry version and contributor instructions now match the v1.8.1 release toolchain (`34a1ad1`). No Solidity or deployed bytecode changed.
- **Lint/compiler compatibility:** the app retains TypeScript 7; tooling that requires the JavaScript compiler API explicitly uses the supported TypeScript 6 compatibility package. Its lock entry and clean installation were corrected and verified separately (`b7ea3e1`, `12a882f`).
- **Missing deployment health check:** Railway's effective settings had no health check despite the checked-in configuration. The production service now explicitly sets `/health`, timeout 60 seconds, and `ON_FAILURE` with three retries. The operations runbook records the effective-setting check (`4bbb21f`).
- **Stale frontend:** the initial production Vercel deployment still served React 18.3.1 from `4fd31c4`, while merged source used React 19.3.0. The release must be redeployed and checked before considering verification complete.
- **Missing automatic frontend releases:** Vercel had no remote Git repository connection. The existing project is now connected to `YieldShield/yieldshield-monad`, with production branch `main` and the original build root. The final merged release will trigger the production build.
- **Combined dependency resolution:** ESLint 10 introduced a Keyv 5 peer resolving to an unrelated root Keyv 4. The lockfile now places its unchanged consumer alongside the already pinned Keyv 5, without changing any package versions or overrides (`56609ad`).

## Contract and test evidence

- Exact deployed identity verification passed for **44 contracts, seven pools and 14 receipt NFTs**, including full runtime bytes, source hashes and canonical deployment receipts. See [verification evidence](evidence/final-contract-verification-20260916.json).
- At block **63,038,044**, all pools were unpaused with backing covering reserved collateral. Factory governance, pool implementations, receipt ownership, token/issuer pins and WMON backing matched expectations. See [single-block state](evidence/final-contract-state-20260916.json).
- **32 Monad tests, 225 inherited module tests, four fresh RPC-fork lifecycle tests, and 57 deployment/finality/lock regressions passed.** Forks exercised expanded-factory creation, deposits, asset/backing exits and provider withdrawals against deployed state without signing or broadcasting. The historical pre-finalization rejection diagnostic remains intentionally excluded.
- **91 API/deployment tests** passed, including cache saturation and forwarding-header quota regressions. **99 frontend tests**, lint, type checking and the production build passed after integrating SWR 2.5.1, ESLint 10.10.0 and Vite 8.3.0.
- Initial HTTP checks passed for 12 app routes, bundled resources, token images, public demo media and API endpoints. Two status samples showed all seven pools ready and fresh reference prices.
- Full-history secret scanning found no leaks, and GitHub reported zero open secret alerts. The repository is public with secret scanning and push protection enabled. Administrator bypass remains enabled at the owner's request.
- The final dependency gate passed over **5,562 emitted browser modules**. The API and contract-tool production audits are clean; the browser has the same two reviewed advisory exceptions. A full `npm ls --all` still reports pre-existing Dynamic, picomatch and UTF-8 peer mismatches and optional Sharp artifacts; it is not globally clean. Clean installation, the corrected Keyv graph and the runtime-exposure gate passed.

## Remaining boundaries

A completed signed-in Dynamic browser transaction and completed external shMON unstaking are still separate checks. Local fork simulation does not establish either. The two inherited Dynamic dependency advisories retain their conditional browser-only exceptions until **16 October 2026**, with the existing module-exposure gate; see [dependency security](DEPENDENCY_SECURITY.md). No exception was relaxed, and no new contract deployment or testnet transaction was required by this review.

Final hosting deployment IDs and post-deployment browser evidence are recorded in [release PR #30](https://github.com/YieldShield/yieldshield-monad/pull/30) after the reviewed release is live.
