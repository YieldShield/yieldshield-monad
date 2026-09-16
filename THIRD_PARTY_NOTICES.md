# Third-party notices

The root [MIT license](LICENSE) covers original YieldShield code unless an individual file declares another license. It does not relicense third-party code, fonts, images or trademarks. Preserve their notices when redistributing the relevant material.

## Imported YieldShield foundation

The Base/Robinhood foundation remains attributed in [PROVENANCE.md](docs/PROVENANCE.md) and the per-file [import manifest](docs/BASE_IMPORT.json). The import date is not a claim that the imported work was created for Metropolis. Historical code and reports retain their original file-level notices.

## Uniswap-derived contracts

These repository-relative paths are **GPL-2.0-or-later**, not MIT:

- `contracts/contracts/oracles/UniswapV3TWAPFeed.sol`
- `contracts/contracts/oracles/libraries/FullMath.sol`
- `contracts/contracts/oracles/libraries/TickMath.sol`

The complete [GNU GPL version 2 text](LICENSES/GPL-2.0-or-later.txt) was retrieved unchanged from [GNU](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt). The source headers allow version 2 or any later version. [contracts/NOTICE](contracts/NOTICE) records the Uniswap source revision and Remco Bloemen's underlying `mulDiv` attribution; the latter's [MIT notice](LICENSES/MIT-Remco-Bloemen.txt) is also included. The repository's MIT license does not remove GPL obligations for these files or a combined GPL work.

## Dependencies

The pinned Git submodules in [.gitmodules](.gitmodules) retain their upstream licenses:

| Submodule | Upstream | License files within the checked-out submodule |
| --- | --- | --- |
| `contracts/lib/openzeppelin-contracts` | [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) | `LICENSE` |
| `contracts/lib/openzeppelin-contracts-upgradeable` | [OpenZeppelin Contracts Upgradeable](https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable) | `LICENSE` |
| `contracts/lib/forge-std` | [Foundry standard library](https://github.com/foundry-rs/forge-std) | `LICENSE-APACHE`, `LICENSE-MIT` |
| `contracts/lib/solidity-bytes-utils` | [Solidity Bytes Utils](https://github.com/gnsps/solidity-bytes-utils) | `LICENSE` |

JavaScript dependencies are recorded in the root, `services/monad/` and `contracts/` lockfiles. Their packages retain their own licenses and notices; the root MIT license is not a license grant for those dependencies. Install the locked dependencies and initialize submodules to obtain their accompanying notices.

## Self-hosted fonts

`apps/monad-web/public/fonts/` contains unmodified Latin WOFF2 subsets of **DM Sans** and **Manrope**, distributed under the SIL Open Font License 1.1. Their copyright and complete licenses are bundled as [dm-sans-OFL.txt](apps/monad-web/public/fonts/dm-sans-OFL.txt) and [manrope-OFL.txt](apps/monad-web/public/fonts/manrope-OFL.txt). The [font source record](apps/monad-web/public/fonts/README.md) identifies the upstream projects and retrieval date.

## Monad app token images and marks

Bundled third-party images identify an ecosystem or asset. They do not imply affiliation, approval or endorsement. No trademark rights are granted by YieldShield's MIT license. Public availability and inclusion in a token list do not establish an unrestricted redistribution license; follow each owner's applicable brand terms when reusing a mark. This inventory records provenance, not a new license grant from those owners.

The files below live in `apps/monad-web/public/assets/tokens/`:

| Local file | Source / owner identification |
| --- | --- |
| `monad.png` | [Monad public image](https://monad.xyz/android-chrome-512x512.png), [Monad brand and media kit](https://www.monad.xyz/brand-and-media-kit) |
| `shmonad.webp` | [shMonad public image](https://www.shmonad.xyz/logo/shmon-icon.webp), [shMonad](https://www.shmonad.xyz/) |
| `ausd.svg` | Agora AUSD; token-list path `mainnet/AUSD/logo.svg` |
| `earnausd.svg` | earnAUSD; token-list path `mainnet/earnAUSD/logo.svg` |
| `smon.svg` | Kintsu sMON; token-list path `mainnet/sMON/logo.svg` |
| `susde.svg` | Ethena sUSDe; token-list path `mainnet/sUSDe/logo.svg` |
| `syrupusdc.svg` | Maple syrupUSDC; token-list path `mainnet/syrupUSDC/logo.svg` |
| `usde.svg` | Ethena USDe; token-list path `mainnet/USDe/logo.svg` |
| `weeth.svg` | ether.fi weETH; token-list path `mainnet/weETH/logo.svg` |
| `wsteth.svg` | Lido wstETH; token-list path `mainnet/wstETH/logo.svg` |

All eight token-list SVGs were verified byte-for-byte on 16 September 2026 against the official [Monad token-list revision `3a34e9b`](https://github.com/monad-crypto/token-list/tree/3a34e9b761422f52c7386ac2714f2d366c841ab9). That repository does not supply a blanket license for these brand images. The asset research and origin links are recorded in [yield-assets.json](docs/research/2026-09-16-yield-assets.json) and [ASSET_VISUAL_PLAN.md](docs/ASSET_VISUAL_PLAN.md).

`scenario.svg`, `test-usd.svg`, `test-vault.svg` and `unknown.svg` are original YieldShield illustrations, not issuer logos. The YieldShield favicon and product mark retain the project's existing identity. Design mockups under `docs/design/2026-09-15/assets/` reuse the same Monad, shMonad and YieldShield artwork and follow these same notices.

## Historical stock images

The unused `apps/web/` application and its stock images were removed from the current tree. Their original notices remain with the [historical application](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/apps/web). Apple, NVIDIA and Meta artwork came from Simple Icons; its [CC0 collection license](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/apps/web/src/assets/stocks/SIMPLE_ICONS_LICENSE.md), [trademark disclaimer](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/apps/web/src/assets/stocks/SIMPLE_ICONS_DISCLAIMER.md) and [per-image sources](https://github.com/YieldShield/yieldshield-monad/tree/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/apps/web/src/assets/stocks/README.md) remain available at that revision. The Alphabet image came from its investor-relations site and is not covered by Simple Icons' license. The collection license does not grant rights to any company's trademarks.
