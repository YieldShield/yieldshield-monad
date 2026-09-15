# Design review

Open `index.html` to compare the three interactive directions. The gallery includes desktop/mobile views, five screens and a reduced-motion control. The full proposal is in [DESIGN_PLAN.md](DESIGN_PLAN.md).

The review server runs at http://127.0.0.1:5180/ while this task is active. To reopen it later, serve this directory with any static web server; for example:

```sh
python3 -m http.server 5180 --bind 127.0.0.1
```

## Scope

These files are standalone design prototypes. Wallet and transaction buttons only display a preview notice. No wallet SDK, RPC request, price quote or production code is involved. Images are bundled locally; review fonts load from Google Fonts with system fallbacks. The repository remains private.

## Review checks

- Inspected all three landing directions and the Protect, Provide, Positions and Faucet screens in the browser.
- Inspected 390px landing and form layouts through the gallery’s mobile view.
- Checked direct asset/backing selection. Selecting shMON resets vault backing to TestUSDC and disables the unsupported pair.
- Checked exit selection and its caption. Corrected a decorative glow that intercepted clicks in Nightfall.
- Corrected Nightfall’s page background and text inheritance, and increased supporting label sizes.
- Checked the reduced-motion setting, local image loading, JavaScript syntax and static file paths.
- Production accessibility, performance and transaction regression checks remain part of the implementation plan. These mockup checks are not a full accessibility audit or a live transaction test.

All changes are confined to this design-review directory.
