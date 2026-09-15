# Monad simplification — 15 September 2026

## Problem and comparison

The live Base app leads with a short value proposition and direct task links. Monad adds eight equally prominent app destinations, repeated explanations, decorative role labels and six visible Faucet operations. Its homepage main content contains 219 visible whitespace-delimited words; Base's main region contains 89. Main-region boundaries differ, so Base is a design reference rather than a controlled benchmark. Monad before/after measurements will use the same main-region method.

## Research applied

- [NN/g: menu design](https://www.nngroup.com/articles/menu-design/): use descriptive task labels and keep primary desktop navigation visible. Our application: Protect, Provide, Positions and Faucet stay visible, including on mobile; specialist destinations move to More.
- [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): show common choices first and make specialist options easy to find. Our application: remove repeated explanation panels; use one clearly named disclosure for pool mechanics.
- [GOV.UK: details](https://design-system.service.gov.uk/components/details/): disclose supplementary information, but do not conceal information most users need. Our application: fees, exit delays, payout conditions and first-loss exposure remain visible beside actions.
- [GOV.UK: clear language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/): prefer familiar words and explain necessary specialist terms. Our application: delete decorative introductions and duplicate headings; retain exact token symbols and use verbs such as Protect, Claim and Wrap.
- [GOV.UK: buttons](https://design-system.service.gov.uk/components/button/): use an obvious primary action. Our application: action states continue to lead to connection, gas, required tokens or transaction approval in that order.
- [W3C: error prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html): users must be able to review and correct consequential inputs. Our application: amounts stay editable and wallet approval/confirmation stays explicit.
- [Vercel interface guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md): preserve labels, keyboard focus, readable errors and visible feedback. Our application: native disclosures, visible loading/error states, responsive checks and accessible controls.

These are product design decisions based on the sources, not claims of measured user-comprehension improvements.

## Separate implementation commits

1. **Plan:** record comparison, research, scope and acceptance criteria.
2. **Navigation and home:** replace the sidebar with four visible task links and More; reduce the homepage to its proposition, direct action and two exit choices. Preserve every route.
3. **Action screens:** remove duplicate headings and explanation sidebars; keep amounts, fee shares, delays, exit consequences and live errors visible. Make the default market explicitly WMON/TestUSDC when available; preserve market-specific links. Reduce comparison, positions, demo trade and learning copy.
4. **Faucet and funding:** two starter steps, concise balance guidance and expandable asset tools. Deep links open their target tool; a pending unstake remains discoverable. Keep unknown balances distinct from zero and keep native gas first.
5. **Verification and release:** test navigation/deep links, disclosures, input preservation, relevant transaction safeguards, desktop/mobile layout and word counts. Commit any verification fixes separately; deploy the tested artifact to the existing domain.

## Acceptance criteria

- Four primary task links; specialist tools remain reachable through More and legacy URLs.
- At least 40% fewer words in the homepage main region, with no loss of the capped-exit explanation. Measure actual output after implementation.
- One task title per action screen; no repeated role-number panels.
- Protection: asset/amount, backing, 12% realized-gain fee, 60-second backing-exit wait and asset surrender/cap remain visible.
- Provide: collective 10% reward share, first-loss exposure, 120-second notice and only unreserved withdrawals remain visible.
- shMON withdrawal valuation and waiting period; vault-share redemption; synthetic demo prices remain explicit when relevant.
- Faucet links reach visible controls; no-gas users reach the official Monad faucet in one action. Loading/error reads never imply a zero balance.
- No loss of wallet confirmation, exact approval, chain/target checks or pending transaction recovery.
- No horizontal overflow at 390px; disclosures and navigation work by keyboard.

## Scope limits

This pass changes presentation and task navigation. The previously recorded intermittent RPC failures, incomplete Dynamic signing walkthrough, untested full shMON unstake queue and absent Kuru orderbook integration remain separately tracked; simpler screens do not establish that those issues are resolved.

## Verification results

15 September 2026, logged-out browser with live testnet API data:

| Main region | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Homepage | 219 words | 61 words | 72% |
| Protect | 174 words | 73 words | 58% |
| Faucet, tools collapsed | 292 words | 79 words | 73% |

Counts use `main.innerText.trim().split(/\s+/).length`. Native select option text is included by the browser; closed disclosure bodies are excluded. Dynamic errors and connected-wallet balances can change counts. Protection now defaults to WMON/TestUSDC; the previous default was a scenario pool. These are content measurements, not a usability study.

Verified in the in-app browser:

- Four primary links and six destinations under More. Escape closes More and returns focus to its summary.
- Pool details toggle with Space and Enter. Financial terms remain outside that disclosure.
- Default WMON, explicit shMON/scenario selection and shareable market query updates. Switching Protect to Provide resets the role-specific default amount to 1,000 backing tokens.
- Direct wrapping/vault links, switching between Faucet hashes, and legacy `/tokens#unstake-mon` redirect open the relevant tool. Closing/reopening wrapping retains the entered amount.
- Home, Protect, Provide, Faucet, Demo trade and Compare pools fit at a 390px frame width without horizontal overflow. Desktop and mobile screenshots reviewed. The local responsive harness was removed before the production build.
- Independent review confirmed all eight Faucet transaction callbacks and existing funding guards were unchanged. Pending unstake expansion was checked in code; no unstake transaction was submitted in this UI pass.
- 35 frontend tests pass, including zero/unknown/error balance handling and explicit/default market selection. TypeScript and production Vite build pass. The existing lazily loaded Dynamic wallet bundle still triggers the known size advisory.

Implementation commits: `5b496da` navigation/home, `421235a` action screens, `00a1702` Faucet/funding. Verification refinements align the demo trade heading with its form and make visible input labels match their accessible names.

Production follow-up: the initial release `08f503f` was deployed as `dpl_BuQ9trFMaxa44eJbxtHuUesK9uXs`. Live Home/Faucet/Protect rendered the expected copy and WMON default. Dynamic’s email and wallet dialog opened without browser warnings/errors; no login code or transaction was sent. This check found two redundant paragraphs in the preceding wallet chooser, removed in a separate copy commit. The live Protect view also reproduced the already documented intermittent pool-read failure before a subsequent successful refresh. This presentation change does not resolve or conceal it.

Final release: `fa5e8cb`, deployed to [monad.yieldshield.ai](https://monad.yieldshield.ai/) as `dpl_CcSHYV6vokDyyJF5gyT8VhSBcB6S`. [The full release checks passed](https://github.com/YieldShield/yieldshield-monad/actions/runs/34978634951). Live verification confirmed the shortened wallet chooser and homepage, with no browser warnings/errors. The private repository policy remains in force. Release history is recorded in [BUILD_LEDGER.md](BUILD_LEDGER.md).
