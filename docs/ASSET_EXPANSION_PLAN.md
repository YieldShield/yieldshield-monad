# Pool creation and Monad asset expansion

16 September 2026. Research and implementation plan; no new tokens or factories have been activated by this document. The user confirmed that each pool should protect **one token selected from a larger list**.

## Recommended result

Use two matching searchable dropdowns: **Protected asset** and **Backing token**. Start with the supported WMON, shMON and sMON-demo choices. Expand to WETH and issuer-documented stablecoins through a separately verified deployment. Keep the Clarity layout, concise labels, token images, Faucet-first onboarding, and the removal of Demo trade.

A token appearing in Monad's ecosystem does not establish that YieldShield can create a working pool for it. Available selections must satisfy the factory's token list, initializer's role restrictions, price rules, and wallet verification.

## What the current code actually permits

- `CreatePool` hardcodes `scenario-mon` and always sends creation to `Factory`. The protected-asset field is read-only. Backing options are hardcoded to TestUSDC and vTestUSDC.
- The existing `ReferenceFactory` already registers YieldShield WMON, shMON, TestUSDC and vTestUSDC. Its three funded pools are WMON/TestUSDC, shMON/TestUSDC and WMON/vTestUSDC. These are the first reference combinations to expose in pool creation. Validate shMON/vTestUSDC separately before offering it.
- `MonadPoolInitializeModule` pins three protected-token addresses and two backing-token addresses. Other tokens revert during initialization even if someone adds them to a factory token list.
- Factories pin their pool implementation. `setPoolImplementation` only asserts the original pin; it cannot replace it. Broader assets therefore require a new initializer, pool router and factory. Existing pools remain operational with their original implementation.
- The active RedStone adapter supports only its pinned WMON, shMON and TestUSDC addresses. WETH and new stablecoins need explicit additional valuation routes.
- Read-only checks at Monad testnet block **62951330** found both factories unpaused, bootstrap finalized, and a minimum creation bond of **500 test-dollar value** (`50000000000`, eight decimals). The form currently requests 1,000 backing tokens regardless of valuation. The governance timelock delay is **172800 seconds / 48 hours**.
- Wallet verification, API pool discovery and the verification script currently assume two named factories and one pool router. Each must become version-aware before accepting pools from a new factory.

The recorded [public-chain observations](research/2026-09-16-asset-candidates.json) include addresses, token metadata, runtime hashes and factory settings. These are point-in-time reads, not a token-security audit or successful transaction simulation. The first audit attempt hit the public RPC rate limit; a throttled retry completed.

## Dropdown and creation flow

1. Default to WMON and TestUSDC on a fresh visit. Honor valid deep links; do not silently substitute another asset for an invalid address or unavailable pair.
2. Show icon, name and symbol in each option. Search by name, symbol or full address. Keep balances secondary; an unknown balance must not look like zero.
3. Group issuer/protocol assets and synthetic demo assets clearly. Disambiguate Circle USDC from YieldShield TestUSDC by address and label. A single token identity is `(chainId, address)`, never its symbol.
4. Filter backing options to the selected asset's compatible factory/version. Retain the current backing if still compatible; otherwise require a visible new choice. Show a short reason for a temporarily unavailable option. Do not accept arbitrary pasted token addresses as approved assets.
5. Reuse the existing picker styling and focus restoration. Use a labeled combobox/listbox for a desktop dropdown and an accessible searchable dialog on small screens. Arrow keys browse, Enter selects, Escape closes without changing the previous selection, and focus returns to the trigger. Follow the [W3C combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
6. Replace the scenario-only heading with “Create a pool.” Keep collateral, fee share, exact bond quantity and exit delays visible in the review. Derive them from the selected factory/version and current backing valuation.
7. Calculate the bond in native token units from the on-chain USD minimum, rounding upward. Use a disclosed price buffer only where needed, refresh the review when terms change, and simulate before signing. Never approve the hardcoded 1,000-unit amount for every future token.
8. Disable selection changes during approval/creation, preserve account and network guards, and freeze the reviewed factory/token/bond tuple for the operation. Recheck that tuple after approval and before creation.
9. Parse the confirmed `PoolCreated` event to open the exact new pool. Its next action is “Provide backing”; holders cannot open protection until the pool is funded. Existing matching pools can be linked without preventing deliberate creation of another pool.

## Asset priorities

| Stage               | Asset                                                        | Role                                | Evidence and remaining work                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First UI release    | YieldShield WMON and shMON                                   | Protected asset                     | Existing deployed reference pools and pricing. Expose them in Create pool with correct factory selection.                                                                                                                                                                     |
| First UI release    | sMON-demo                                                    | Protected asset                     | Keep the existing isolated scenario option under Demo assets. It is unrelated to Kintsu sMON.                                                                                                                                                                                 |
| First UI release    | TestUSDC and vTestUSDC                                       | Backing                             | Existing initializer support. Derive options and bond amounts from actual capabilities.                                                                                                                                                                                       |
| Expanded deployment | Circle USDC, testnet                                         | Backing                             | Circle and Monad list the same address; live code, USDC symbol and six decimals verified. Needs valuation, initializer support, issuer-token behavior review and usable funding.                                                                                              |
| Expanded deployment | WETH, testnet                                                | Protected asset                     | Monad lists the address; live code, WETH symbol and 18 decimals verified. Needs a working ETH/USD price route and a verified acquisition path before activation.                                                                                                              |
| Expanded deployment | Agora AUSD, testnet                                          | Backing                             | Agora publishes a Monad testnet address and faucet; code, AUSD symbol and six decimals verified. Needs valuation, faucet/transfer checks and factory support.                                                                                                                 |
| Expanded deployment | Monad-listed WMON                                            | Protected asset                     | Current official token list has a different address from the older address investigated during initial setup. Live code and metadata verified. Check deposit/withdraw behavior, then give it its own identity and oracle route. Preserve existing YieldShield WMON positions. |
| Later research      | Kintsu sMON, BTC representations and additional vault shares | Protected asset or reviewed backing | Validate current testnet identity, redemption behavior, price support and funding. Mainnet listings and older testnet articles are insufficient to activate these.                                                                                                            |

Verified candidate addresses on chain 10143:

| Candidate         | Address                                      | Primary source                                                                                                               |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Circle USDC       | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | [Circle contract directory](https://developers.circle.com/stablecoins/usdc-contract-addresses)                               |
| WETH              | `0x45477f4709771331db81944A5E20eF95Bc7BA2D7` | [Monad testnet token list](https://raw.githubusercontent.com/monad-crypto/token-list/refs/heads/main/tokenlist-testnet.json) |
| Monad-listed WMON | `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541` | [Monad testnet token list](https://raw.githubusercontent.com/monad-crypto/token-list/refs/heads/main/tokenlist-testnet.json) |
| Agora AUSD        | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` | [Agora deployments](https://docs.agora.finance/developer/contract-deployments)                                               |

The [shMonad directory](https://docs.shmonad.xyz/addresses/) still identifies the testnet address already used by YieldShield. Monad's [mainnet asset directory](https://docs.monad.xyz/developer-essentials/network-information/tokens-and-bridges) is useful for later research, but mainnet addresses must not enter testnet transactions.

## Contract and data design

Introduce an explicit versioned capability registry shared by the API, wallet and UI:

- Factories: address, runtime hash, expected pool router/hash, initializer/version, environment, approved protected/backing roles, supported pair policy, terms and governance identity.
- Assets: chain/address, decimals, source/provenance, display image, valuation route, funding method and role eligibility.
- Creation snapshot: observed block/time, verified identity, pause/capacity state, current whitelist, supported combinations, bond floor, backing price and specific unavailability reasons.

Cross-check the curated registry against current chain state. A token list from an issuer is an input to onboarding, not automatic transaction authorization. An unhealthy new token must not unnecessarily hide healthy old pools. Keep reference and synthetic valuation domains explicit.

The new factory must retain storage-compatible protocol modules, immutable implementation identity, strict backing-price validation, and the existing governance model. Use a bounded, constructor-validated role configuration for the new initializer instead of adding another hardcoded JSX list. Finalize bootstrap and hand control to the intended timelock. Subsequent governed changes must honor the delay; this plan does not authorize bypassing it.

For USDC/AUSD on testnet, define the valuation policy explicitly: either a verified feed or an explicitly labeled test-unit convention restricted to that testnet. Do not describe test-unit valuation as an observed dollar peg or reuse it on mainnet. WETH requires a verified ETH reference; no hidden constant-price or synthetic fallback. Reuse RedStone if supported, otherwise assess another official provider before selecting it. No paid oracle subscription is assumed.

Token onboarding includes issuer proxy/implementation identity, decimals, transfer accounting, pause/denylist behavior, static balances, and any vault or withdrawal restrictions. Confirm price freshness, decimal normalization, future/nonpositive rounds, and unavailable-price behavior before adding a selectable pair.

## Website integration

Use the same registry for Create pool, Protect, Provide, Compare pools, positions, Network status and the Faucet. List only activated, usable markets in the main landing choices; keep the homepage compact as the catalog grows. Unknown assets retain the neutral icon fallback.

Each new asset needs a complete entry path: obtain testnet MON for gas, obtain/wrap/stake the selected token, fund the bond or deposit, then reach the correct pool. Keep creation funding separate from holder funding. New stablecoins are backing options, so their main entry point belongs in Provide and the backing dropdown.

The [Circle faucet](https://faucet.circle.com/) currently advertises 20 USDC per address/network every two hours. That is substantially below the current 500-unit-equivalent creation floor. Do not present a single faucet visit as enough to create a USDC-backed pool. Resolve test liquidity and creator funding explicitly; keep TestUSDC as an accessible initial backing route. Verify Agora's documented faucet before adding a claim action.

## Sponsor fit

AUSD is a relevant Agora integration candidate, and Dynamic remains the existing onboarding layer. Adding AUSD alone does not establish eligibility for an Agora bounty. The last recorded signed-in review requires a broader Mera/Perpl mobile flow; recheck current terms before making a claim. The public hackathon pages could not be retrieved by the web tool during this research, so no fresh bounty verification is claimed here.

Preserve the user's decision to remove Demo trade. Asset acquisition can use verified wrap/stake/faucet flows without reintroducing a trading screen. Existing sponsor research is historical context, not an instruction to restore trading.

## Implementation sequence — separate commits

1. **Creation capability model:** verify current factories, encode permitted roles/pairs and expose creation settings without weakening wallet checks.
2. **Asset dropdowns:** add the shared searchable picker, expose WMON/shMON/scenario choices, filter backing choices, remove scenario-only form copy, and preserve deep links.
3. **Creation transaction flow:** dynamic bond math, refreshed review, captured asset/factory tuple, simulation, receipt-specific success navigation, and funding guidance.
4. **Versioned factory support:** registry/API/discovery/wallet/verification changes for multiple immutable router versions, with old-pool regression coverage.
5. **Expanded contracts and pricing:** new initializer/router/factory plus reviewed token valuation adapters. Local and fork tests must pass before any broadcast.
6. **Asset activation:** separate commits and evidence for USDC, WETH, AUSD and official-list WMON as each passes its funding, price and identity gates. Do not block the initial dropdown release on every candidate.
7. **Website propagation:** icons, pool lists, Faucet routes and accurate availability states across the app. Keep existing asset IDs and receipt routes working.
8. **Release verification:** fund selected test pools, verify holder/provider journeys, update evidence, deploy API before the compatible frontend, and confirm the public site. The source was kept private during this rollout; the owner authorized [publication](PUBLICATION.md) on 16 September.

Acceptance requires keyboard/mobile selection, no invalid pair submission, exact 6/18-decimal handling, correct factory and approval spender, stale-price rejection, account/network-change protection, pending-transaction recovery, successful new-pool discovery, and continued withdrawals from existing pools. Merely displaying more token symbols is not acceptance.

Start with steps 1–3 for useful existing-asset selection. The asset-expansion release depends on verified feeds, test liquidity and the new immutable deployment. No mainnet migration or basket/multi-asset pool is included.
