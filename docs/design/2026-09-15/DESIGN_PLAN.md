# YieldShield on Monad — design proposal

15 September 2026. Proposal and interactive mockups; not a production rollout.

## Recommendation

Choose **A — Clarity** as the product direction. It retains the restored sidebar, the original overlapping-square YieldShield mark, Monad purple, and concise copy. Make the two possible exits tangible with a small interactive illustration. Put recognizable assets directly below the hero so the landing page leads naturally into the product.

Borrow C’s direct asset selection for returning users. B is a viable alternative if a more dramatic Monad identity is preferred, but dark surfaces should be tested with users before applying them across financial forms.

## What needs improving

The current interface is functional and substantially simpler than before. Its visual hierarchy is still uneven: a large static two-card illustration does little explanatory work; the homepage does not display the assets available to try; action screens, status panels and supporting pages use different spacing and type scales. The CSS contains both older and newer layout rules, which increases the chance of inconsistent changes.

Improve hierarchy and consistency rather than adding more sections or marketing copy. The visual should answer “what can I do, and what happens to my asset?” without resembling a return chart or implying a guaranteed payout.

## Three directions

| Direction                    | Landing page                                                                                                             | Application                                                           | Tradeoff                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **A — Clarity, recommended** | Warm white, ink typography, purple primary action, physical asset/backing illustration, three recognizable asset choices | Quiet forms and explicit terms; progressive disclosures for mechanics | Strongest continuity and clarity; less dramatic than B                               |
| **B — Nightfall**            | Dark aubergine canvas, lavender headline, illuminated asset/backing layers                                               | Dark content surfaces with the familiar light sidebar                 | More visually distinctive; greater contrast and theme-maintenance burden             |
| **C — Direct**               | Embedded asset and backing selection beside the headline; exit illustration below                                        | Same components continue into Protect and Provide                     | Faster for returning users; more decisions before a newcomer understands the concept |

All versions include Landing, Protect, Provide, Positions and Faucet mockups at desktop and mobile widths. They are visual prototypes: no account access, API calls, quotes, approvals or blockchain transactions. Form terms reflect the existing testnet demo. Unsupported shMON/vTestUSDC selection is disabled.

## Landing-page structure

1. **Familiar shell.** Keep the left sidebar, original logo in Monad purple, wallet access and testnet identification. Group supporting navigation below the four primary tasks. Do not remove existing routes during implementation; prototype navigation is abbreviated for design review.
2. **One proposition.** “Keep your upside. Choose your exit.” Supporting line: “Keep your asset, or exchange it for capped backing.” Main action: “Protect tokens.” Secondary: “How it works.” Keep fees and waiting periods visible in one short line.
3. **An explanation that responds.** Show the deposited asset and separately supplied backing as two recognizable layers. “Keep asset” brings the asset forward; “Take backing” brings the backing forward while fading the surrendered asset. The caption describes the cap and surrender. The composition illustrates alternatives, not simultaneous ownership of both assets.
4. **A clear starting point.** Display Wrapped MON, Staked MON and the synthetic demo option with the new asset images. Choosing one should open the matching eligible protection pool. Preserve the Faucet-first route for wallets without gas or required tokens.
5. **Compact provenance.** A small “Built with” line can identify the actual Dynamic, shMonad and RedStone integrations. Link these to evidence or relevant details. Do not imply sponsor endorsement, audits, grants, liquidity or unimplemented integrations.
6. **A short footer.** Legal/privacy and pool details. Avoid extra feature grids, live counters, invented TVL, yield promises or repeated explanations.

Target fewer than 100 visible main-content words in the default landing view. Exact token names and essential qualifications are worth keeping; decorative slogans are not.

## Design system for the whole app

- **Identity:** preserve the Base logo’s exact geometry and dark square; Monad purple `#6E54FF` replaces Base blue. Keep official token images separate from product branding.
- **Typography:** use Manrope for headings and DM Sans for controls/body in the proposal. Production: self-host subset fonts, verify redistribution terms and retain system fallbacks. Use 48–64px desktop hero text, 40–48px mobile hero text, 32–38px page titles, 14–16px body/input text and at least 12px essential supporting labels.
- **Spacing:** one 4/8px scale. Consistent 20–28px form padding, 24–32px section gaps and a 48–56px desktop content gutter. Adapt to the sidebar’s width; do not squeeze desktop columns into tablet widths.
- **Surfaces:** warm white page, white task surfaces, thin neutral dividers. Use 12–16px corners for controls/cards and 20–24px for primary illustrations/dialogs. Reserve strong shadows for overlays.
- **Color:** purple indicates the primary action and selection. Soft cyan identifies backing in explanations. Amber identifies demo assets or attention. Always include text or shape as well as color. Maintain WCAG AA contrast for text and controls.
- **Asset recognition:** preserve address-based image lookup and neutral unknown-token fallback. Asset images remain decorative beside readable names. In production, available assets/backing combinations must derive from the verified API registry, including discovered eligible pools, rather than the mockup’s fixed examples.
- **Controls:** use one primary action per task, consistent field labels, 44px touch targets, visible keyboard focus and readable mobile inputs. Reuse the existing native-dialog picker behavior and focus restoration if the picker remains a dialog.

## Screen-by-screen improvements

| Screen              | Change                                                                                             | Essential information to retain                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Protect             | One focused form, recognizable selected asset/backing, large amount field, compact review          | Exact token units, fee, exit delay, cap, surrender condition, quote freshness and validation                  |
| Provide             | Same form structure with backing emphasized; concise explanation of provider role                  | First-loss exposure, shared variable rewards, notice period, unreserved backing limit                         |
| Positions           | Clear disconnected/empty state; later group live receipts by protected assets and supplied backing | Actual balances, fees, pending notices, action availability and receipt links; never synthetic account totals |
| Position detail     | Prominent eligible next action; mechanics and event history below                                  | Asset exit versus backing exit, caps, quantities, fees, waiting periods and errors                            |
| Faucet              | Two starter steps; preparation tools remain expandable and use matching asset icons                | MON for gas first, balances unknown versus zero, claim cooldown, shMON unstaking delay, vault redemption      |
| Compare pools       | Refined existing illustrated cards; align card content and actions                                 | Shield/backing pair, readiness, reference versus demo, available backing and correct routes                   |
| Demo trade          | Reuse the form system and visual selector                                                          | Synthetic-only scope, actual quote expiry, slippage and approvals                                             |
| Create pool         | Same form vocabulary and clear funding summary                                                     | Creator bond, required token funding, parameters and on-chain validation                                      |
| Status and evidence | Compact tables and readable disclosures                                                            | Verified versus unverified states, freshness, contract addresses, actual integrations and limitations         |
| Legal/help          | Readable text column and the shared shell                                                          | Existing legal and risk content stays accessible                                                              |

## Motion specification

| Interaction            | Motion                                            | Duration and behavior                                                               |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Landing introduction   | Small vertical entrance with opacity              | 350–550ms, once; no delay before interaction                                        |
| Exit explanation       | Asset or backing moves forward; the other recedes | 500–650ms; driven by user selection                                                 |
| Replay                 | Position → asset exit → backing exit              | About 3.5 seconds total, user-triggered, pauseable, no loop                         |
| Buttons/asset choices  | Subtle elevation or color response                | 120–180ms; at most 2–3px movement                                                   |
| Picker and disclosures | Quick entry/exit or immediate reveal              | 120–180ms; preserve focus and keyboard behavior                                     |
| Transaction states     | Clear text and existing progress feedback         | Never animate balances optimistically or show completion before a confirmed receipt |

Honor both the operating system’s reduced-motion preference and a preview override. With reduced motion, changes appear immediately and explanatory text remains complete. Avoid particles, continuously floating cards, parallax, automatic carousels, flashing prices and background video. A small transform/opacity implementation is sufficient; no WebGL dependency is needed for this concept.

## Implementation sequence

Each step should be reviewed and committed separately after a direction is chosen.

1. **Unify visual tokens and the shell.** Consolidate spacing/type/surface rules; retain the restored sidebar and original logo. Verify every existing route before changing page content.
2. **Build the landing page.** Introduce the refined hero and route-linked asset choices. Check disconnected, funded and no-gas entry paths; default/deep-linked market behavior stays intact.
3. **Add motion.** Implement the exit explainer as a small accessible component. Add reduced-motion and keyboard controls; measure layout stability and performance.
4. **Apply shared task components.** Bring Protect, Provide and Demo trade onto the same field/review/action patterns. Preserve existing wallet-selection, quote-expiry and pending-transaction guards.
5. **Align the supporting screens.** Positions, Faucet, Compare pools, Create pool, Status, evidence and help/legal pages. Include loading, empty, unavailable, network-error and pending-transaction states.
6. **Verify and release.** Run frontend tests and build; check mobile and keyboard flows; compare screenshots; deploy a review preview before promoting the selected design to production. Record the commit and deployment. Do not make the repository public without separate authorization.

## Acceptance checks

- The original logo, sidebar preference, concise wording and image-based asset identification survive the redesign.
- At 390px and 320px, no horizontal overflow or hidden primary action. Confirm content reflows at 200% zoom.
- Essential information remains visible with reduced motion and without relying on hover.
- Text contrast is at least 4.5:1 for normal text; control/focus contrast at least 3:1. Verify each real surface, especially Nightfall.
- Keyboard users can open/close selectors, choose an exit and navigate forms without losing focus.
- No invented balances, rates, quotes, payouts, partners or proof metrics.
- Preserve existing unit and integration tests, account/provider-change guards, pending transaction recovery and quote deadlines.
- Performance targets after implementation: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at the 75th percentile when sufficient field data exists. Before field data exists, use lab measurements as estimates, not proof of these targets.
- Reconfirm sponsored integrations and Metropolis requirements when preparing the submission. A design refresh alone does not prove prize eligibility.

## Research informing the proposal

- [W3C: animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html): make nonessential interaction-triggered motion disableable. This is a WCAG AAA criterion used here as an additional design safeguard, not a claim of full AAA compliance.
- [web.dev: high-performance animation](https://web.dev/articles/animations-guide): prefer transform and opacity; avoid animating layout properties or routinely forcing layers.
- [Vercel interface guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md): visible labels/focus, image dimensions, reduced motion, clear action language and robust content handling.
- [GOV.UK details](https://design-system.service.gov.uk/components/details/): disclose supplementary material, while keeping information most users need visible.
- [web.dev: Web Vitals](https://web.dev/articles/vitals): use real performance thresholds and distinguish field measurements from lab estimates.

The three directions are design proposals, not conclusions from a usability study. Validate the chosen direction with a few first-time users: ask them to find a supported asset, explain the two exits, locate the Faucet, and describe who takes losses first.

## Asset provenance

The mockups reuse the existing locally bundled Monad and shMonad marks, the original YieldShield mark and the project’s original test-token illustrations. See [asset sources and usage](../../ASSET_VISUAL_PLAN.md#sources). Fonts load from Google Fonts in these review files; the implementation plan calls for self-hosting them.
