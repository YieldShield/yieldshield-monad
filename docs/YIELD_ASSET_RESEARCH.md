# Monad yield asset catalog

Checked 16 September 2026. The application remains on Monad testnet (10143).

| Asset | Yield mechanism | Integration state |
| --- | --- | --- |
| syrupUSDC | Maple credit strategies | Monad mainnet token verified in the official directory; no verified Monad testnet deployment found. Bridging, withdrawal queues and share-price sourcing need a separate integration. |
| sUSDe | Ethena staking rewards reflected in share value | Mainnet OFT; do not assume the Monad representation exposes Ethereum vault redemption methods. |
| USDe | Synthetic dollar; holding alone does not accrue sUSDe staking rewards | Mainnet OFT, catalogued separately from yield-bearing shares. |
| earnAUSD | Upshift vault shares, strategies curated by Gamma Research | Mainnet OFT share token; queued withdrawals and reserve-dependent instant exits. |
| wstETH / weETH | Liquid staking / restaking | Mainnet bridged representations, not verified testnet transaction assets. |
| Kintsu sMON | Liquid staking | Distinct from the application's synthetic sMON-demo token. Mainnet catalog only pending current testnet verification. |

The official Monad list identifies earnAUSD's **share token** as `0x103222f020e98Bba0AD9809A011FDF8e6F067496`. Upshift's article links its **vault** at `0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA`. These serve different roles; neither address is configured as a testnet token. No APY is hardcoded.

## Primary sources

- [Monad mainnet token directory](https://raw.githubusercontent.com/monad-crypto/token-list/refs/heads/main/tokenlist-mainnet.json)
- [Monad testnet token directory](https://raw.githubusercontent.com/monad-crypto/token-list/refs/heads/main/tokenlist-testnet.json)
- [Maple withdrawals](https://docs.maple.finance/syrupusdc-usdt-usdg-for-lenders/risk)
- [Ethena rewards](https://docs.ethena.fi/solution-overview/protocol-revenue-explanation/rewards-mechanism-explanation)
- [Ethena USDe](https://docs.ethena.fi/solution-overview/usde-overview)
- [Upshift earnAUSD guide and vault link](https://www.upshift.finance/blog/earning-stablecoin-yield-on-monad-with-earnausd)

## Testnet activation

Agora publishes a testnet AUSD token and faucet. Public reads confirmed six decimals, deployed proxy implementations, a 10,000 AUSD drip and a global 60-second cooldown. The faucet checks its token supply and recipient balance. Activation requires successful token transfers and a funded pool journey. AUSD testnet pricing is explicitly one **valueless test-dollar unit**, never a claim of an observed dollar peg.

Circle USDC is deployed, but the public faucet's 20-unit allocation is below the current 500-unit creation bond. WETH's documented testnet contract currently reports zero supply; a verified funding path and ETH price feed remain outstanding. These candidates stay unavailable until those gates pass. No mainnet transactions, substitute issuer tokens, faucet-limit bypasses or paid oracle subscriptions are part of this release.

### Canonical WMON compatibility finding

A local fork reproduced a failure in the existing factory modules' rebasing-token detection: canonical WMON routes unknown selectors to its payable deposit fallback. `STATICCALL` rejects that state-changing fallback and consumes almost all forwarded gas. Repeated unbounded marker probes exhaust even a 16-million gas call before registration completes. This release leaves the token **unregistered and unselectable**. Its price route exists in the immutable policy but does not override the factory whitelist. Supporting it requires a separate review of gas-bounded token probes throughout factory and pool modules. Existing YieldShield WMON and shMON work with AUSD backing.

The failed registration was an **estimate**, with no signed transaction or journal entry. The [continuation review](evidence/expansion-continuation-review.json) records all 16 existing confirmed intents, unchanged. Revised sample pool creation uses previously unused journal IDs, while the original signer, fee cap, budget, canonical receipt checks and resume-intent equality checks remain enforced.
