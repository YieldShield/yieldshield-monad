# Asset recognition

Replace symbol-only identification with a consistent visual system, retaining the sidebar and concise action screens.

1. **Asset images.** Bundle the public Monad and shMonad marks locally. Give TestUSDC, vTestUSDC and sMON-demo original, visibly distinct illustrations. Map known images by deployed address; unknown assets receive a neutral fallback even when they reuse a known symbol.
2. **Visual selection.** Replace the native market dropdown with a compact selected pair and a native dialog containing clearly labelled choices. Show asset name, backing token, current selection and demo grouping. Preserve market IDs, URL selection, filtering and transaction calculations. Provide keyboard focus, Escape, close button and mobile scrolling.
3. **Consistent recognition.** Use the same images in pool illustrations, amount fields, positions, price sources and Faucet preparation. Keep text names visible; images are decorative alongside them. Never present TestUSDC as Circle USDC.
4. **Verify and release.** Check address-based identity, unknown-asset fallback, default/deep-linked selection, switching asset and backing, demo-only trading, keyboard cancellation/focus and mobile layout. Run frontend tests and the production build; commit each implementation step and deploy to the existing Vercel project.

## Sources

- [Monad site and media kit](https://www.monad.xyz/brand-and-media-kit): [public Monad image](https://monad.xyz/android-chrome-512x512.png).
- [shMonad](https://www.shmonad.xyz/): [public shMON image](https://www.shmonad.xyz/logo/shmon-icon.webp).
- [Vercel interface guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md): visible labels, image dimensions, clear focus, touch controls and restrained copy.
- [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog): native modal focus, inert background, Escape dismissal and explicit close control.

Brand marks identify the underlying ecosystem/protocol, not endorsement. The existing WMON contract is YieldShield's testnet wrapper. Test-token artwork is original YieldShield artwork. Public images retrieved on 2026-09-15; no runtime request to a third-party image host.

## Delivery and verification — 2026-09-15

- `632bcb6`: locally hosted token images, address-based identity, unknown-asset fallback and images beside amounts/positions/status.
- `4408dc7`: native dialog picker with asset/backing pairs, short names, current selection and separate demo group.
- `eb9bcb6`: illustrated pool cards and Faucet preparation icons.
- 81 frontend tests passed, including four new identity checks. TypeScript, formatting and the production build passed.
- Browser checks: default WMON pool; shMON selection; vault-backed liquidity selection using Tab and Enter; Escape and close-button dismissal; focus restored to trigger; direct URL retains vault backing; demo trade shows only its two demo pools. No transactions were submitted.
- At 390px, all five choices remain readable and a tap on the final demo/vault choice updates the form and backing description. Desktop pool cards and Faucet illustrations inspected visually.
- Production deployment `dpl_6tAKaxJCMjh3E6uwPQNRboWi4HUU` is ready at https://monad.yieldshield.ai/. All six image URLs return HTTP 200 with the expected image content type. The live shMON deep link opens the picker with all five choices and no broken images.
- Source remains private. Image files total approximately 82 kB; no new dependency, backend change or contract change.
