# YieldShield on Monad — research and build plan

Prepared 9 September 2026 for David Hawig and Santiago. Proposed operator: Hawig Ventures UG (haftungsbeschränkt). This is a plan, not a deployment or an assessment that any external protocol is safe for real funds.

**Sponsor priority update, 9 September 2026:** follow [the sponsor strategy](SPONSOR_STRATEGY.md) for the current integration order and evidence gates. Dynamic onboarding is the first sponsor feature to pursue; executable Kuru trading and Agora's mobile trading opportunity are the next investigations. Chainlink's advertised bounty requires a CRE workflow, so oracle selection is a separate decision. Public bounty titles are verified; detailed portal terms still need a fresh signed-in review. This update supersedes the earlier treatment of sponsor work as an unspecified optional extension.

This supersedes the product and implementation direction in the [8 September plan](MONAD_METROPOLIS_PLAN_2026-09-08.md): use the current **YieldShield Base application** as the implementation reference and build a separate Monad repository. The earlier application record remains historical evidence of what was entered.

## 1. Recommended product

Build **YieldShield on Monad: hold MON and staking assets with a second way out**. Keep the Base app's consumer experience, two economic roles and gain-sharing model. Center the product on MON exposure, dollar-denominated backing and clear exit choices.

The first working market should protect **WMON with USDC backing**. The target hackathon release adds **one Monad liquid staking token**, with shMON the first candidate to investigate and Kintsu sMON the alternative. A third market using a redeemable test USDC vault as backing demonstrates productive collateral if the main flows are complete.

Proposed repository: `YieldShield/yieldshield-monad`. Proposed eventual domain: `monad.yieldshield.ai`. Neither has been created or provisioned by this research task.

**Why this direction:** MON holders and Monad stakers are a specific audience. Their exposure, staking conversion, gas token, price feeds and trading venues make the application meaningfully local to Monad. A broad token catalog would multiply pricing and liquidity work before proving the two-sided product.

The economic distinction must stay visible: holders give up part of positive gains for a conditional backing exit; junior providers receive that gain share and take loss risk. Neither side's return is guaranteed. The main commercial question is whether junior providers find the compensation attractive enough to fund continuing protection.

## 2. What the research established

| Finding | Implication |
| --- | --- |
| Stocks do exist on Monad. Monday Trade announced its public tokenized-stock/RWA launch on 16 April 2026 with Anchored; the announcement describes 24/5 RWA trading. | Omit equities because of the intended product focus and integration scope. Do not claim Monad cannot support them. Issuer permission, token transfer and pricing requirements would still need separate diligence. [Monday Trade](https://blog.monday.trade/rwas-are-live-on-monday-trade/) |
| Circle publishes native USDC contracts for Monad mainnet and testnet. | Use Circle's deployment identity as the default stablecoin reference. A ticker alone is insufficient. [Circle](https://www.circle.com/blog/now-available-usdc-cctp-wallets-and-contracts-on-monad) |
| Agora publishes AUSD deployments on both networks. | AUSD is a credible second backing candidate and a possible ecosystem integration. Plain AUSD holdings should not be described as automatically earning yield. [Agora deployments](https://docs.agora.finance/developer/contract-deployments) |
| Kuru publishes WMON, MON/USDC and MON/AUSD mainnet markets and a routing API. | Investigate Kuru for acquisition and sale, while retaining a direct deposit path for tokens already held. Its published testnet USDC is different from Circle's. [Kuru contracts](https://docs.kuru.io/contracts/Contract-addresses), [routing API](https://docs.kuru.io/kuru-flow/flow-overview) |
| shMON represents liquid staking exposure, with a changing MON conversion rate. The protocol publishes mainnet and testnet addresses. | A concrete LST candidate, subject to current contract and price checks. Its deposit and withdrawal rates differ, so a single naive exchange-rate calculation is insufficient. [shMON addresses](https://docs.shmonad.xyz/addresses/), [rate mechanics](https://docs.shmonad.xyz/exchange-rate) |
| Kintsu sMON accepts native MON and uses batched, delayed redemption. | A second LST candidate, requiring its native-asset interface and redemption lifecycle to be handled explicitly. [Kintsu integration guide](https://docs.kintsu.xyz/the-kintsu-protocol/architecture-and-integration/monad-lst-architecture/3rd-party-integration-guide) |
| Morpho's official app lists Monad USDC vaults, including August USDC V2. | Real yield-bearing backing has a research path. This is evidence of a candidate, not approval of its risk, liquidity or testnet availability. [Example vault](https://app.morpho.org/monad/vault/0x80017bF0f793EBbE9679Cd61ff0e395B62CAbB59/august-usdc-v2) |
| Monad documents Pyth MON/USD on its primary oracle contract, including testnet support. | Pyth is the default oracle integration to investigate. Do not reuse the retired beta MON/USD contract. [Monad oracle directory](https://docs.monad.xyz/tooling-and-infra/oracles) |

These are documentation and product-page findings as of the research date. I did not execute swaps, verify deployed bytecode through RPC, measure order-book depth, or test an external protocol's redemption. Those are explicit acceptance gates below. Published addresses, particularly older testnet references, must be checked on the current network before use.

## 3. The Base app is the right starting point

I inspected the live [landing page](https://base.yieldshield.ai/), [trade flow](https://base.yieldshield.ai/trade) and [protection markets](https://base.yieldshield.ai/markets), alongside the local repository at `/Users/david/Documents/source/yieldshield-base`, revision `f05165050e3b8a9091bc295b0817516772cc4deb`.

The current version already includes crypto and backed vault shares, alongside the original stock assets. Its UI separates trading, protection and collateral provision. Purchases remain wallet holdings until the user separately opens a protected position. The landing page explains the two exit paths with a layered senior/junior illustration.

The README records 13 funded Base Sepolia pools and eight traded assets after the 9 September extension. Those are demo deployment facts from the repository, not customer adoption. Existing internal tests and transaction journals were inspected as evidence; they were not rerun for this plan.

Reuse the React/Vite application, core money/position types, EVM wallet adapter, receipt lifecycle, fee previews, backing reservation logic, transaction review and deployment verification patterns. Preserve their existing regression tests.

Changes go deeper than colors:

| Current source area | Required Monad change |
| --- | --- |
| `apps/web/src/config/stocks.ts` and asset artwork | Replace stock-oriented names with an asset registry. Add MON, selected LST and backing identities. Remove equities from the initial Monad catalog and landing imagery. |
| `packages/adapter-evm/src/chains.ts` | Add explicit Monad configurations; current map contains Base and Robinhood. Gas is MON. Keep mainnet and testnet separate. |
| `apps/web/src/lib/protection-status.ts` | Replace Base chain IDs, fixed demo counts, stock action names and Base-only price assumptions with a versioned Monad schema. Validate exact configured markets. |
| `packages/adapter-evm/src/vaults.ts` | Its current checks assume a test vault holds all underlying in its own address. An invested lending vault or staking contract needs a different, reviewed valuation and liquidity adapter. |
| `AlphaVaultBackingFeed.sol` | Current constructor and support checks explicitly require Base Sepolia. Preserve the distinction between a protected-asset price and the denominator used to calculate a backing-share payout. |
| `services/base-api.mjs` and related readers | Create a Monad service with no dependency on the Base service or Base deployment files. Price source, chain, freshness and action availability must remain explicit. |
| Deployment and publishing scripts | Create independent manifests, owners, receipts, address registries and resumable deployment steps. The Base extension assumes an existing Base deployment; copying that recipe verbatim cannot initialize Monad. |

The Base contracts use immutable modules to fit Base's size limits. **Keep that implementation for the first Monad rehearsal** to preserve the known behavior. Monad's larger limits make a later monolithic deployment an option, but changing architecture is not a prerequisite for this hackathon. Preserve storage-layout and selector checks. The existing [module review](../../yieldshield-base/contracts/config/BASE_MODULE_SECURITY_REVIEW.md) is internal engineering evidence, not an independent audit.

## 4. Asset and market selection

| Asset or pair | Priority | Proposed treatment |
| --- | --- | --- |
| MON / WMON | Required | Native MON for gas; WMON for the pool's ERC-20 accounting. Show wrap/unwrap explicitly and leave enough MON for transaction costs. |
| WMON → USDC backing | Required | First complete market. Preserve the recorded USD entry-value model and token reserve cap. |
| shMON → USDC backing | Target | First LST investigation. Admit only after transfer, valuation, minimum amount and exit checks pass. |
| sMON → USDC backing | Alternative | Use instead of shMON if its integration proves clearer. Do not implement both LSTs during the first sprint. |
| WMON → redeemable test USDC vault shares | Stretch within hackathon | Demonstrate backing that accrues explicitly funded test yield. Label payout in shares; underlying redemption is a separate action. |
| WMON → AUSD backing | Optional ecosystem extension | Add only if faucet funding, current contract identity, oracle coverage and exact sponsor requirements are established. |
| Real Morpho USDC vault shares | Post-MVP research | Review curator, underlying assets, adapters, losses, withdrawal limits and valuation. A Morpho listing alone is insufficient to enable deposits. |
| WBTC / wrapped ETH | Later expansion | Validate exact Monad representation and bridge/issuer, price feed and executable liquidity. Do not carry over Base cbBTC or WETH addresses. |
| Memecoins, leveraged tokens, LP receipts, tokenized stocks | Outside initial release | Each adds distinct manipulation, valuation or liquidity requirements. |

**Target pool count: two core pools, with a third vault-backed demonstration if time permits.** Avoid reproducing all 13 Base pools or every combination of protected/backing assets.

For LSTs, distinguish three quantities: the MON reference price, the contract's redemption value per share, and an executable market quote. They can diverge. A protocol exchange rate is not evidence of instant liquidity or a market price floor. shMonad documents both delayed unstaking and liquidity-dependent atomic unstaking; Kintsu documents batch and cooldown requirements. [shMonad staking overview](https://docs.shmonad.xyz/liquid-staking/), [Kintsu guide](https://docs.kintsu.xyz/the-kintsu-protocol/architecture-and-integration/monad-lst-architecture/3rd-party-integration-guide).

Keep protection **USD-denominated** for this release. Using MON or an LST as junior backing would expose the reserve to MON's decline too. A promise to preserve a fixed number of MON would require different accounting and a separate design decision.

## 5. Define three distinct environments

| Environment | Purpose | Data and execution |
| --- | --- | --- |
| Monad testnet integration | The main working hackathon product | Actual testnet transactions, configured test tokens and external reference prices where available. Clearly state that test tokens have no monetary value, even when reference USD values are displayed. |
| Scenario lab | Repeatable explanation of gains, losses, stale prices and backing caps | Separate contracts, addresses and labeled scenario tokens. Reuse the funded test exchange and vault mechanics. Controlled prices never authorize transactions in another environment. |
| Monad mainnet preview | Optional evidence of future ecosystem fit | Read-only token, protocol and quote information. No funded YieldShield market or enabled mainnet execution is implied. |

Do not silently fall back from live reference data to synthetic prices. An unavailable oracle produces a visible unavailable state. The scenario lab remains usable through its own clearly labeled route.

During feasibility, check whether the MON and stablecoin faucets can fund both participants, trade inventory and the configured backing reserve. Scale demonstration amounts to available test balances. If a separate locally issued TestUSDC is needed for the scenario lab, give it its own identity and label; never substitute it for Circle USDC in an integration market. Keep a refill procedure in the demo runbook so judges do not depend on an exhausted faucet.

The minimum release must include a working external-price integration for MON plus the complete protection lifecycle. If the LST integration fails its gate, publish the WMON result and disclose the reduced scope; do not relabel a mock as shMON or Kintsu.

## 6. Consumer experience and Monad identity

Keep the Base app's generous spacing, large type, clear figures, compact navigation and two-layer explanation. Use an off-white/light-lavender canvas as the default so it still feels like YieldShield. Deep plum panels and Monad purple provide the ecosystem identity without turning every surface into a gradient.

Monad's official palette supplies purple `#6E54FF`, lavender `#DDD7FE`, ink `#0E091C`, white and black, plus secondary cyan `#85E6FF`, pink `#FF8EE4` and orange `#FFAE45`. Use purple for primary actions/senior identity, cyan with dark text for junior identity, and orange for pending states. Keep explicit role labels and test contrast; color alone must not carry meaning. The brand kit specifies Britti Sans, Inter and Roboto Mono. Use Inter and Roboto Mono initially; use Britti only if the required font rights/assets are available. [Official brand kit](https://www.monad.xyz/brand-and-media-kit).

Rework the existing layered hero illustration: MON/LST exposure on a lavender upper layer, a deep-plum reserve with cyan detail below. Preserve the YieldShield logo with a small Monad label. Chain branding identifies where the product runs; it should not imply an endorsement.

Suggested headline: **Keep your MON exposure. Choose your exit.** Supporting copy should explain that holders can withdraw their tokens or surrender a position for its eligible backing payout.

| Page | Required behavior |
| --- | --- |
| Welcome | Explain holder and backing-provider roles; show both exits and a simple loss example; allow browsing before wallet connection. |
| Trade | MON/USDC purchase and sale where supported; show venue, exact input/output token, fee, tolerance and expiry. Keep wrapping separate from buying. A completed purchase offers an explicit next step to protect. |
| Protect | Show WMON and the selected LST, wallet balance, gain share, backing asset, current capacity and waiting conditions. Unsupported integrations do not appear as actionable markets. |
| Position detail | Separate deposited tokens from wallet holdings. Show original recorded value, current reference value, net token exit, estimated backing payout and original cap. Explain why either action is unavailable. |
| Provide collateral | Show backing supplied, committed reserve, withdrawable excess, notice lifecycle, gain-share rewards and losses. Put junior risk next to the deposit decision. |
| Test tokens / vault | Obtain gas and test assets; show faucet cooldown and funding. If included, vault deposit/redeem displays actual share conversion and funded yield contributions. |
| Market status | Show chain, contract verification, price source/time, LST rate basis, backing capacity and action-level blockers. A service health light is not a claim that every withdrawal can succeed. |
| How it works / scenario lab | Explain the economic outcome interactively without a wallet. The execution lab uses separate test fixtures. |

A consumer should understand the payout asset and commitment before seeing ABI names, oracle vendor details or deployment diagnostics. Put those details in expandable explanations and the status page.

## 7. New repository and architecture

Start from a pinned, explicitly attributed snapshot of the Base implementation. Create an independent deployment and application, keeping the original Base repository intact. Exclude environment files, keys, wallet state, build caches, unrelated application videos and private application documents from the import.

```text
yieldshield-monad/
  apps/web/                 consumer app and scenario explanations
  packages/core/            amounts, positions, quotes and market capabilities
  packages/adapter-evm/     Monad reads, transaction preparation and wallet execution
  contracts/               imported protocol, new adapters and regression tests
  services/                read-only status, bounded history and quote integration
  config/                  networks, assets, market policies and theme
  deployments/             separate testnet integration and scenario manifests
  scripts/                 prepare, deploy, verify, publish and smoke-test
  docs/                    architecture, asset decisions, provenance and demo guide
```

Keep React, Vite, TypeScript and viem from the existing app. Pin the working lockfile and Node runtime; a framework rewrite provides little hackathon value. Remove Solana/Robinhood runtime dependencies from this repository only after checking which shared imports rely on them.

The browser prepares and simulates transactions; the user's wallet signs them. The status/quote service needs no user signing key. Start with bounded RPC reads and indexed logs from deployment blocks. Add a database or dedicated indexer only if history performance warrants it. An API outage must not become permission to transact with stale quotes.

Use one typed registry keyed by **chain ID and address**, with token decimals, native-wrapper behavior, provenance, protected/backing eligibility, oracle kind and display metadata. Generate frontend/API configuration from verified manifests, and make publishing fail when any expected token, pool, receipt or code identity disagrees.

A new status schema should distinguish `synthetic`, `external-reference`, `redemption-nav` and `executable-quote` price bases. Keep quote expiry, RPC snapshot freshness, oracle publish time and protocol conversion time separate. A recently fetched old price remains old.

## 8. Oracle, trading and contract work

**MON pricing.** Investigate Pyth first: its MON/USD feed is documented on the primary contract. Reuse the existing adapter boundary, validating feed identity, decimals/exponent, positive value, publish time and confidence bounds. Fetch and pay for required updates, then simulate the actual user action. Reuse any suitable existing update entrypoint; otherwise make update and action two explicit steps with a renewed preflight. Do not build a custody router solely to hide the extra signature. [Monad oracle directory](https://docs.monad.xyz/tooling-and-infra/oracles), [Pyth troubleshooting](https://docs.pyth.network/price-feeds/core/troubleshoot/evm).

**LST valuation.** Build a narrow adapter for the selected protocol rather than forcing it through the demo vault adapter. Validate the published conversion methods, share decimals, minimum supply and deposits, transfer behavior, bounds on rate changes and delayed/atomic redemption semantics. Document whether protected entry and fees use reference NAV or a market-sensitive value. Do not claim protection against a market discount if the oracle only sees NAV. The testnet display uses testnet conversion state, labeled as reference valuation.

**Backing-share valuation.** Keep it distinct from protected-asset valuation. The Base implementation already has a separate backing feed because an upward-clamped share value used as a payout denominator can pay too many shares. Preserve rounding and original token caps. A new external vault needs a reviewed adapter for deployed assets and withdrawal limits; changing `balance >= totalAssets` to an unconditional pass would remove a substantive check.

**Trading.** Kuru is the preferred external venue to evaluate. Verify the exact pair and route on the target network, output minimum, spender, recipient, transaction target and expiry. Its routing documentation and testnet contracts do not prove the mainnet Flow service supports our desired testnet route. If that fails, retain the explicitly labeled inventory-backed test exchange for the demo and direct acquisition outside the app. Keep any optional mainnet quotes read-only. [Kuru Flow](https://docs.kuru.io/kuru-flow/flow-overview), [contract registry](https://docs.kuru.io/contracts/Contract-addresses).

**Monad deployment.** Testnet is chain `10143`; mainnet is `143`. Use current Monad-aware Foundry, which the docs specify as version 1.8 or later, and the target network revision. Rehearse factory-created pools as well as direct deployments. Account for gas-limit charging, reserve-balance behavior, RPC history limits and different opcode pricing; do not transplant Base gas estimates or L2 sequencer rules. Monad currently documents 128 KB runtime and 256 KB initcode limits, but deployment must still pass actual gas and configuration checks. [Monad differences](https://docs.monad.xyz/developer-essentials/differences), [Foundry](https://docs.monad.xyz/tooling-and-infra/toolkits/foundry), [chain IDs](https://docs.monad.xyz/developer-essentials/changelog).

**Protocol scope.** Preserve the existing gain-sharing and reserve model, receipt ownership, partial token exits and junior notice checks. Do not add fixed premiums, expiry policies, undercollateralization or cross-pool capital reuse to the first release. Demo waiting periods must be labeled and configured per deployment. A small testnet policy should not be presented as a production risk calibration.

## 9. Economics to explain and validate

Illustration only: one holder deposits MON exposure worth 100 reference USD; one junior provider supplies 150 backing tokens worth 1 each. Ignore prior accrued fees, gas, rounding and other participants; assume eligibility and valid contracts/prices.

| Outcome | Holder | Junior provider |
| --- | --- | --- |
| Exposure falls to 80; holder takes token exit | Receives remaining tokens worth about 80 | Committed backing is released under the protocol rules; normal notice/withdrawal checks still apply. |
| Exposure falls to 80; holder takes backing exit | Surrenders the full remaining position for 100 backing tokens; position closes. | Retains 50 backing tokens plus a claim to surrendered tokens worth 80: total 130 against 150 initially. Absorbs the 20 loss. |
| Exposure rises to 120; ordinary exit with illustrative 12% gain fee | Retains approximately 117.60 of token value. | Receives the configured junior share of the gain fees, not all protocol/pool fees. |

The protected exit does not pay only the loss while the holder keeps the asset. The payout targets recorded value but is limited by the original backing-token cap and other contract conditions. A backing depeg can reduce its purchasing power. Junior withdrawal notice does not release capital that remains committed.

For LST positions, show staking-rate growth separately from MON price change; the existing USD gain-sharing model can include both in gains. Avoid presenting a staking APR as the junior provider's return or promising holders they retain every staking reward after fees.

Before discussing a mainnet pilot, model falling, rising, flat and oscillating MON paths; fee crystallization followed by loss; synchronized protected exits; backing depeg; vault loss; and slow unstaking. Compare junior loss and capital lockup against earned fees. Use this to test the economics with potential providers, not to invent an attractive APY.

The implementation evidence for these mechanics is summarized in the [Base tranche review](BASE_TRANCHE_CLAIMS_AUDIT_2026-09-09.md) and [collateral research](BASE_CRYPTO_COLLATERAL_RESEARCH_2026-09-09.md).

## 10. Delivery schedule and work packages

David has confirmed full-week availability. Santiago's hours and preferred responsibilities remain unconfirmed. Proposed split: one owner for contracts/oracles/deployment and one for app/adapter/status; David also owns interviews, partner questions and submission. Assign the technical owners based on actual strengths, rather than assuming roles from names.

| Dates | Work | Completion evidence |
| --- | --- | --- |
| **9–11 Sep** | Pin Base source, prepare new repository plan, verify current WMON/USDC/Pyth contracts, probe shMON and Kintsu, inspect Kuru network/pair support. | Asset decision record; working reads, bytecode identities and local MON protection rehearsal. Select one LST or record the reason it is deferred. |
| **12–15 Sep** | Create repository; install Monad theme and registry; deploy isolated testnet factory, receipts, pool and backing; implement wrapping and faucet onboarding. | User can obtain assets, fund backing, deposit WMON and find the receipt in the app. |
| **16–20 Sep** | Finish normal/protected exits, gain fees, junior notice/withdrawal and external-price refresh. Implement selected LST adapter if its gate passed. | Complete holder and junior journeys, including real blocked-action explanations and actual received-token balances. |
| **21–25 Sep** | Integrate tested trading path; finish scenario lab and mobile UX; run external walkthroughs. | Repeatable purchase → optional protection → exit journey and measured user feedback. Public project information reflects actual capabilities. |
| **26 Sep–2 Oct** | Add the vault-backed demonstration or one qualifying ecosystem extension if core is stable; run economic scenarios. | Funded test-vault redemption and correct share payout, or a documented sponsor integration. No extra feature is allowed to break the core release. |
| **3–9 Oct** | Freeze scope, complete regression/security review, verify source and deployments, produce video and judge guide. | Release candidate, passing required checks, signed-out access to all submission artifacts. |
| **10–12 Oct** | Final walkthrough, update application facts, submit before the internal deadline. | Submitted project and confirmation captured. Internal target: **12 Oct, 18:00 Europe/Berlin**. |

Planning estimate, excluding a production audit: repository/theme 16–24 hours; network/deployment 20–30; pricing 20–30; full core UI/status 24–36; trading/onboarding 16–24; validation/docs/video 24–36. **Core total: 120–180 person-hours**, plus roughly 24–40 for one LST adapter and 16–24 for test vault backing. Integration uncertainty can exceed these estimates. Work should be gated by evidence rather than using the dates as permission to bypass checks.

**Cut rules:** if current token/oracle identity is unresolved by 11 September, resolve it before UI expansion. If an LST cannot be valued and transferred reliably, remove its actionable market. If external swap integration fails, use the labeled test exchange. If both exit paths and junior accounting are incomplete by 25 September, drop vault backing, AUSD and AI extras. A Mainnet release is a later milestone, not a requirement to make this testnet submission credible.

## 11. Acceptance tests and user validation

Preserve existing regressions and add tests for new behavior. The meaningful release checks are:

1. **Network and identity:** reject wrong chain, stale deployments, substituted tokens with identical tickers and mismatched bytecode. Recheck wallet chain/account before signing.
2. **Amounts:** native MON and WMON differ; test mixed decimals, fractional deposits, minimums, rounding and sufficient remaining gas balance.
3. **Holder lifecycle:** deposit, receipt, positive-gain fee, partial token exit, ordinary full exit and full backing payout. Verify receipts and resulting balances rather than trusting a success toast.
4. **Junior lifecycle:** deposit, notice, claim rewards, partial/full excess withdrawal, loss allocation and epoch/dust behavior. Reserved capital cannot escape after notice matures.
5. **Oracle failures:** stale/future/invalid prices, confidence limits, delayed update, changed share rate, LST discount and missing feed. Never silently authorize using demo data.
6. **Liquidity races:** two deposits compete for final capacity; quote inventory disappears; a withdrawal changes availability between preview and signing. Re-simulate and present a useful retry path.
7. **Vault behavior, if included:** funded share appreciation, redemption loss, low liquidity, donation/inflation behavior, share payout precision and original cap preservation.
8. **UI and integration:** disconnected wallet, user rejection, reload after signing, delayed receipt, RPC/API outage, token allowance and expired quote. Include keyboard and mobile checks at common phone widths.

Record testnet transaction hashes, receipt blocks, relevant balance changes and configuration for a reproducible walkthrough. Separate team tests and seeded backing from external use.

Research targets: interview five MON/LST holders and three potential junior providers, then observe ten external walkthroughs. At least eight of ten should complete the supported path with minimal help; at least eight should correctly explain the surrendered asset, payout cap and junior loss role. These are proposed success criteria, not current traction.

## 12. Hackathon differentiation and submission

Stay in **Onchain Finance & Trading**, already selected. The new-work narrative should be: native MON handling, a Monad asset/oracle registry, external-reference pricing, a protocol-specific LST adapter where completed, two-sided protection UX, executable transaction checks and a documented Monad deployment.

Track reused Base contracts/UI separately from each new module, integration, test and deployment. The source revision above is the 9 September import reference, not a claim that all imported work is new or eligible Monad work. Preserve attribution and dated history in `docs/PROVENANCE.md` and `docs/HACKATHON_DELTA.md`. A new repository or fresh commit date alone does not establish originality.

The public site still says open source is optional; the registration rules viewed on 8 September require public source under an OSI-approved license, substantial new work and AI-tool disclosure. Plan to satisfy the stricter registration rules. Preserve dependency licenses, including the GPL-licensed TWAP component if included; the contracts' MIT license does not establish the license for every imported file. [Public hackathon page](https://www.monad.xyz/developers/hackathons/metropolis), [recorded registration requirements](MONAD_METROPOLIS_APPLICATION_2026-09-08.md).

Recorded final deadline: **13 October 2026, 23:59 ET / 14 October, 05:59 CEST**. The portal showed submission opening 22 September. Recheck its live rules before final submission. Required deliverables include a working Monad mainnet or testnet product, source/documentation, addresses or transaction evidence, and a public demo video of at most three minutes.

Suggested three-minute story: 20 seconds for MON holders and the two roles; 35 for a funded pool and optional acquisition; 35 for opening protection; 40 for a prepared eligible backing exit and junior outcome; 25 for a blocked-action example; 25 for completed Monad-specific integrations and source/deployment evidence. Prepare eligible positions ahead of recording; do not imply an onchain delay was skipped.

Choose a sponsor bounty only after reading its current exact requirements. Agora and Kuru are plausible product fits. AUSD support or a Kuru link alone is not proof of qualification. Do not add an AI chat interface simply to claim AI relevance; a read-only explanation of verified position data is a later option.

## 13. Initial address references for the feasibility pass

These are **documentation references, not an executable whitelist**. Verify current chain state, ABI, decimals, proxy implementation where relevant, transfer behavior and intended role before importing any address.

| Item | Network | Published address |
| --- | --- | --- |
| Circle USDC | Monad mainnet | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| Circle USDC | Monad testnet | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Kuru-listed WMON | Monad mainnet | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` |
| Kuru-listed kUSDC / USDC | Monad testnet | `0xf817257fed379853cDe0fa4F97AB987181B1E5Ea` |
| Agora AUSD | Monad mainnet | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` |
| Agora AUSD | Monad testnet | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` |
| shMON | Monad mainnet | `0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c` |
| shMON | Monad testnet | `0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9` |

Sources: [Circle](https://www.circle.com/blog/now-available-usdc-cctp-wallets-and-contracts-on-monad), [Kuru](https://docs.kuru.io/contracts/Contract-addresses), [Agora](https://docs.agora.finance/developer/contract-deployments), [shMonad](https://docs.shmonad.xyz/addresses/). The current testnet WMON and Kintsu addresses remain to be established in the feasibility pass. Do not assume mainnet addresses also work on testnet.

## 14. First implementation milestone

The first milestone is a new, attributed repository containing the Monad-branded app, verified network/token configuration and **one complete WMON/USDC testnet market**, with both holder exits and the junior lifecycle demonstrable. The asset decision record should then determine whether shMON, sMON or neither is ready for the second market. This makes the next build step concrete while preserving room for the research results to change an integration choice.
