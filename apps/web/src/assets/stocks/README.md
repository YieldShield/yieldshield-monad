# Stock company images

Reviewed 2026-09-08. These files identify the companies referenced by the four test stocks. They are display metadata only, independent of verified token addresses, prices and transaction construction.

## Decision

For four curated companies, bundled assets are simpler and more reliable than a runtime logo API. There is no new package, API key, subscription, external image request or domain/ticker guessing. Vite inlines the small SVGs and emits a content-hashed file for Alphabet. The four images total 7,105 bytes before compression.

Logo.dev supports a hosted logo API, but its free commercial plan requires visible attribution and account setup ([official documentation](https://www.logo.dev/docs/platform/attribution)). Revisit such a service if the catalog grows enough that manual brand maintenance becomes impractical. A third-party favicon endpoint was also unnecessary: it introduces a runtime dependency and can return low-resolution or unrelated site icons.

## Sources

Apple, NVIDIA and Meta SVG geometry comes from Simple Icons at immutable revision `777807a262bb7384ff406fd4b35fdcd02e9514c3`:

- [Apple SVG](https://raw.githubusercontent.com/simple-icons/simple-icons/777807a262bb7384ff406fd4b35fdcd02e9514c3/icons/apple.svg), black `#000000`; source brand: https://www.apple.com
- [NVIDIA SVG](https://raw.githubusercontent.com/simple-icons/simple-icons/777807a262bb7384ff406fd4b35fdcd02e9514c3/icons/nvidia.svg), green `#76B900`; source brand: https://www.nvidia.com/en-us
- [Meta SVG](https://raw.githubusercontent.com/simple-icons/simple-icons/777807a262bb7384ff406fd4b35fdcd02e9514c3/icons/meta.svg), blue `#0467DF`; [brand resources](https://www.facebook.com/brand/resources/meta/company-brand)

Only an explicit fill using the source metadata color was added; geometry and proportions are unchanged. SVGs contain a title and a path, without scripts or external resources. The upstream collection license and disclaimer are included alongside these files. The collection's CC0 dedication does not grant rights to third-party trademarks; company marks remain their owners' property and identify the referenced companies without implying affiliation or endorsement.

Alphabet's compact red A is from its [official investor relations site](https://abc.xyz/), which uses this icon family. [32px original](https://s206.q4cdn.com/479360582/files/favicon-32.png). The original URL ends in PNG but the actual file is JPEG, so the local extension is `.jpg`. Bytes are unchanged and display is capped at 32 CSS pixels. The symbol `tGOOGLc` maps to Alphabet, the listed parent company, rather than a Google product icon. This file is not covered by the Simple Icons license.

## Rendering and maintenance

`config/stocks.ts` is the allowlist for names and imported images. Shared `AssetGlyph` reserves fixed space, preserves image proportions, and falls back to a letter for an unknown symbol or failed image. It is decorative next to visible company/token text, so assistive technology does not announce the same identity twice. The native trading selector remains keyboard accessible, with the selected company's image beside it.

Coverage: stock catalog, trade selector and holdings, faucet basket, protection setup/deposit/pool/position, position lists, collateral pool selection, account balances and token selection. Cash and unrelated assets retain their generic glyphs.

To update a brand, use a reviewed source, preserve its geometry, replace the local asset, record the new source/revision here, and check the catalog and narrow layouts. Do not derive image URLs from user input or untrusted token metadata. Do not import the entire icon collection for four marks.
