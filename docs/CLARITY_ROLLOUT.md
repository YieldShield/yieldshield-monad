# Clarity rollout

Implemented and published on 15 September 2026 from the selected [Clarity design proposal](design/2026-09-15/DESIGN_PLAN.md).

## Release

- Production: https://monad.yieldshield.ai/
- Vercel deployment: `dpl_D7tWWonPCTTPyTB1defzX1d8uyAe`
- Deployment URL: https://yieldshield-monad-px28jis4b-noc2-6281s-projects.vercel.app
- Deployed code: `5cda025` on `main`.
- The repository was private at this rollout; [publication followed on 16 September](PUBLICATION.md). No backend, contract, or environment configuration changes were needed.

The release keeps the restored sidebar and original YieldShield overlapping-square mark in Monad purple. Warm white surfaces, self-hosted Manrope/DM Sans fonts, consistent task forms, and shorter landing copy now extend across the application. The landing page presents verified live asset routes and an interactive explanation of the two exits, with replay, pause, and reduced-motion controls.

## Separate implementation commits

| Commit    | Step                                                                                         |
| --------- | -------------------------------------------------------------------------------------------- |
| `085c591` | Typography, visual tokens, shared shell, self-hosted font licenses, and obsolete CSS cleanup |
| `77bc2b9` | Landing page and verified, address-deduplicated live asset choices                           |
| `4611147` | Interactive exit explanation with accessible motion controls                                 |
| `7a945d2` | Shared Protect, Provide, and Demo trade form layouts                                         |
| `c266c8d` | Scroll and focus reset on page navigation                                                    |
| `9ac5b01` | Positions, Faucet, and supporting page consistency                                           |
| `1424c85` | Contain decorative exit artwork at narrow widths                                             |
| `5cda025` | Wait for token metadata before formatting position balances                                  |

## Verification

- 87 frontend tests passed across 11 files, including new asset-routing and homepage funding coverage. Type checking, production build, formatting, and diff checks passed. Vercel's production build completed successfully.
- Landing, Protect, Provide, Positions, Faucet, Compare pools, Demo trade, How it works, Network status, Build evidence, Create a pool, and Legal were checked at a 320px frame width (305px content with the browser scrollbar): no horizontal overflow or broken images. Additional 390px, 640px, 768px, and desktop checks covered the landing and task layouts.
- The pool selector was checked with keyboard opening, selection, Escape dismissal, and focus restoration. Navigation resets scroll and focuses the main content without disrupting market-query changes or hash anchors.
- The shMON protection route and the WMON/vTestUSDC provider route retained their correct asset units and terms. The latter retains its vault-redemption warning.
- All three exit explanation states, replay completion, pause, and the manual reduced-motion control were checked. Reduced motion removes transitions while retaining complete explanations; operating-system preference handling was also reviewed in code.
- Key color pairs were measured: muted text 5.82:1, primary button text 4.80:1, purple text on its pale surface 5.15:1, and input border contrast 3.24:1. Essential supporting labels have a 12px floor.
- The two bundled font files total 61,556 bytes, with OFL licenses included. No animation dependency was added.
- AST comparison of 24 transaction, approval, oracle-update, and contract-read calls against the pre-redesign baseline found identical parameters.
- The final deployment was built with production configuration, then promoted. Its generated URL requires Vercel authentication, so final browser verification used the public custom domain after promotion.
- The live landing page loaded all three current asset choices, the new fonts, and images without overflow. The live Dynamic screen opened with email and existing-wallet options. No application console errors were observed during these checks; a separate Vercel login-page Google identity error preceded the public-domain visit.
- The production status endpoint returned HTTP 200, Monad testnet chain 10143, verified contracts, and five markets during release verification.

## Limits and follow-up

This was a frontend design release. No new blockchain transactions were signed, and it does not replace the existing end-user Dynamic signing or complete shMON unstaking checks. No full accessibility conformance or field-performance claim is made: native 200% browser zoom and real-user Web Vitals remain unmeasured. Narrow-layout reflow was checked separately.

The unchanged dependency tree still produces audit advisories and a large lazy-loaded Dynamic SDK bundle. Those are separate dependency/performance work, not changes introduced by Clarity.

Refresh the product walkthrough video when preparing the Metropolis submission; existing recordings show the previous design. Reconfirm current eligibility and source-publication requirements at that time. The owner authorized [source publication](PUBLICATION.md) on 16 September.
