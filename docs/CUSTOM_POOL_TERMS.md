# Custom pool terms — 16 September 2026

The Monad app now exposes the pool-creation parameters available in the Base creation form while retaining Monad's verified asset registry and testnet waiting periods. Existing contracts already accept these parameters; no contracts were redeployed or governance settings changed.

## Creator choices

- Collateral: 100–500%, subject to the backing token's on-chain minimum.
- Provider share of realized gains: 1–50%.
- Creator share of realized gains: 0–20%.
- Creation bond: the current backing-token amount required to satisfy the factory's USD minimum, or a larger amount. A zero governance minimum is supported.
- The initial 1% protocol share is displayed separately as a protocol requirement.

Inputs use percentages rather than basis points. Validation preserves exact token units and rejects excess precision. The selected terms are included in the review fingerprint; the form checks fresh factory requirements before approval and again before creation. Changing the asset pair resets the bond and suggested collateral to the new pair's requirements.

## Related behavior

Pool discovery accepts non-default collateral and fees while preserving factory, router and asset verification. Market snapshots expose the actual collateral ratio, provider fee, creator fee and protocol fee. Capacity accounts for that ratio, existing exposure, native backing reserves, deposit limits and TVL limits, using the contract's rounding rules.

Pool cards and selectors distinguish pools using their terms and addresses. Protect/provide reviews, backing reserves, gain-sharing previews and withdrawal timing use actual pool settings. Failed term reads never substitute preset values. The guide's calculator remains an explicitly labeled example.

## Separate commits

1. `51eb79c` — API discovery, capacity and creation limits, with API regressions.
2. `7126715` — editable creation terms, transaction arguments and input validation.
3. `b6ce333` — actual pool terms throughout previews, selectors and displays.
4. `d960b60` — integrate dependency updates already published on main.
5. `4fd31c4` — complete the selector's typed test fixtures.

Each step was pushed separately to `codex/custom-pool-terms`; the integrated release was pushed to main without rewriting history.

## Verification and deployment

- 78 API/deployment tests and 99 frontend tests pass with the current main-branch dependencies.
- TypeScript, the production build, lint for changed files, formatting and diff checks pass.
- Browser checks cover editable terms, custom gain totals, below-minimum input errors, conversion to vault-share bond units, pool selection, protection previews, and layouts at desktop and 390/320-pixel viewport widths.
- Live creation data reports all three factory versions available, with token-specific collateral minima and backing quotes.
- Live `/api/status` at block `62999300` reported schema 5, all 44 contract code checks passing and all seven existing pools ready.
- Runtime logs for the new Railway deployment showed normal startup and no reported errors at verification time.

Source release: `4fd31c4157b617984ae989683df432d237bd235e`.

- Railway API: `bdd0524b-bf07-40f5-869e-ac65516b5d89`, successful.
- Vercel website: `dpl_3ojde4pPUPLnuGDxwZRSzS9YYPE6`, ready, served at https://monad.yieldshield.ai.
- Hosted release checks passed, including Monad lifecycle and 225 imported module regressions: https://github.com/YieldShield/yieldshield-monad/actions/runs/35082071577.
- Hosted production dependency review passed. The Git history scan was still queued when this record was written: https://github.com/YieldShield/yieldshield-monad/actions/runs/35082071465.

These checks cover UI behavior, live read-only data, transaction argument construction and regression tests. No new pool was created with a signed user-wallet transaction during this release verification.
