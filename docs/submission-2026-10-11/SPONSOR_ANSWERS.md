# Sponsor answers — factual draft, 11 October 2026

Copy only answers whose current integration and evidence have been verified. Sponsor selection does not establish eligibility or an award. The 11 October reference-price outage disables MON/shMON pool actions; September execution evidence is historical. A fresh 10-test-USDC Kuru quote is currently unfillable, so the historical fill must not be described as a currently repeatable trade. Envio has been removed at the user's instruction.

## Dynamic — describe SDK authentication, wallet or signing integration

YieldShield uses the Dynamic React SDK for email authentication, embedded-wallet provisioning and existing-wallet connection on Monad testnet. The SDK loads when onboarding opens and restores a previously selected Dynamic session after reload. Its wallet client is used for explicit user signing; our read-only API holds no user signing key.

Before signing, YieldShield reacquires the selected wallet, checks the account and chain 10143, verifies the target and spender, obtains exact token approvals where needed, and simulates the action. A pending transaction hash survives reload so an interrupted flow can reconcile its receipt instead of blindly sending again.

The historical 16 September browser evidence follows Continue with Dynamic → external MetaMask: wrap 0.01 test MON, approve and protect WMON, display the receipt, reload and restore the wallet/position, then withdraw the asset and close the receipt. Canonical receipts confirm the three final transactions and the receipt NFT burn. A fresh 11 October Dynamic-to-MetaMask browser test deposited 1 sMON-demo, recovered the wallet and receipt after reload, withdrew 0.5 sMON-demo with receipt replacement, then received 55.269586 TestUSDC through the backing exit. A 10 TestUSDC provider deposit also succeeded. These are user-confirmed Monad testnet transactions. Email-based embedded-wallet signing is configured but is not claimed as exercised by this evidence.

Evidence: https://github.com/YieldShield/yieldshield-monad/blob/ef194f7/docs/DYNAMIC_BROWSER_CHECK.md

## Kuru — target user segments

Our first users are MON and shMON holders who want to keep crypto exposure while understanding their alternatives if prices fall. Within this group, Kuru serves people who need to acquire native MON before wrapping it or staking into shMON and separately opening a protected position. Experienced DeFi liquidity providers are the complementary segment; they supply backing and accept first-loss exposure for a share of realized gains.

The product's trading feature is deliberately a focused funding journey: acquire native test MON through Kuru's Spot V2 order book, withdraw it to the connected wallet, then choose a separate protection action. Buying MON does not automatically open protection. The current integration is Monad testnet only. A fresh quote for 10 test USDC was unfillable on 11 October; the September execution below is historical, and we do not claim current liquidity or an available buy-then-protect reference-market path.

## Kuru — case studies, research evidence of demand and live user statistics

Our present evidence establishes technical execution, not customer demand. The committed internal test used Kuru's real testnet order book and recorded five successful transactions: claim test tokens, approve exactly 10 Kuru test USDC, deposit to the signer's Kuru account, buy native MON, and withdraw it to the same wallet. The fill used 10 valueless test USDC and produced 199.3974978 test MON, above the reviewed minimum of 198.400510311 MON. Canonical receipts, the SpotSwap event, account balances and gas reconciliation are public.

This is one internally scripted funding journey, not external trading activity. The record explicitly states that it did not open protection. We do not have documented external user counts, customer trading volume, retention statistics, interview outcomes or committed liquidity to claim. Our market research identifies selling spot exposure, holding shMON and a separate MON perpetual hedge as alternatives; it does not prove demand for YieldShield. The next test is an observed cohort of six holders and four potential backing providers, including a browser buy-then-protect journey and a second-session check.

Evidence: https://github.com/YieldShield/yieldshield-monad/blob/ef194f7/docs/KURU_INTEGRATION.md

Research/validation plan: https://github.com/YieldShield/yieldshield-monad/blob/ef194f7/docs/MARKET_READINESS_2026-09-16.md

## Kuru — roadmap beyond the hackathon

First, complete observed browser journeys from Kuru acquisition to protection and measure failures, completion time and comprehension of the two exits. Then validate demand with holders and the economics with providers, tracking repeat sessions and concrete provider requirements. Improve funding/recovery UX from those observations, preserve quote expiry and minimum-output protections, and keep the distinction between acquisition and protection visible.

Before any mainnet launch, undertake further security review, validate real market liquidity and oracle coverage, define operating controls, and make an explicit launch-readiness decision. Additional assets or chains will follow verified integration and user demand rather than appear as unsupported trading choices. These are planned steps, not completed adoption or guaranteed mainnet dates.

## Kuru — onboarding and retaining traders

Onboarding starts with Dynamic or an existing wallet, clear Monad testnet identification and a small, guided funding amount. The Kuru flow shows the connected account, verified market, input, minimum output and quote expiry. It uses exact approval, an owned Kuru account and a separate withdrawal back to the wallet. The next step explains that MON still needs wrapping or staking and a distinct protection deposit.

We plan to acquire early users through founder-led Monad/staking-community introductions and concise product walkthroughs. Retention will be tested through useful position visibility, reliable receipt recovery and understandable exit management, with a measured return visit rather than incentivized transaction counts. There is no claimed retention rate or active trader cohort yet.

## Chainlink CRE — meaningful orchestration

YieldShield's CRE workflow checks whether its public application's backing and oracle observations match Monad testnet state. A cron capability starts an HTTP capability request to the public `/api/status` endpoint. The workflow validates the network and fixed assets/feeds, obtains identical-value consensus on a compact API snapshot, and uses CRE's EVM capability at the exact block named by that snapshot.

It verifies the block header, reads backing, reservations and paused status for the WMON/AUSD and shMON/AUSD pools, and independently checks WMON, shMON and AUSD feed health. It performs up to 13 EVM reads. When a pinned feed explicitly reports unhealthy through `isPriceStale`, the workflow skips its reverting protected price getter and emits a critical `oracle-price-unavailable` alert with a null price. It never invents a replacement price. Network, capability and unexpected contract-read failures still stop execution.

The **fresh official authenticated CRE CLI simulation completed successfully on 11 October 2026 at block 70157292**, using live public HTTP and Monad EVM capabilities. It performed 11 EVM reads and returned a critical report with two alerts: the upstream WMON and shMON prices were unavailable. Both pools' backing, reservations and paused state matched the independent on-chain reads; the API correctly agreed with the unhealthy reference feeds, and AUSD remained healthy. This demonstrates useful monitoring of a real outage, not a claim that the affected markets are available.

The result is a machine-readable JSON report and execution logs. The repository preserves the exact command, CLI/SDK versions, source/config/binary hashes and complete successful output. Type checking, official SDK WASM compilation and 18 tests with 82 assertions passed. The workflow also detects API mismatches, stale or future observations, low backing, paused pools and over-reservation. It has no withdrawal authority and performs no blockchain writes. This is a point-in-time local simulation, not a DON deployment or continuous monitor, and it does not replace the protocol's settlement oracle.

Source and reproduction: https://github.com/YieldShield/yieldshield-monad/blob/ef194f7/docs/CHAINLINK_CRE.md

Workflow source: https://github.com/YieldShield/yieldshield-monad/blob/ef194f7/integrations/chainlink-cre/pool-health/workflow.ts

Current original CLI log: https://github.com/YieldShield/yieldshield-monad/blob/ef194f7/docs/submission-2026-10-11/evidence/chainlink-cre-simulation-20261011.txt

Current result and hashes: https://github.com/YieldShield/yieldshield-monad/blob/ef194f7/docs/submission-2026-10-11/evidence/chainlink-cre-simulation-20261011.json

The separately dated September simulation remains available as historical evidence of a healthy execution; the October critical result is the current submission evidence.

## Envio — selection decision

**Remove from bounty selections, as explicitly instructed by the user on 11 October.** The newer repository implements an Envio HyperSync-backed transaction-history feature, but the September release says no API token was configured and the history panel was hidden. Installed code alone does not meet the portal's stated requirement. Do not activate Envio or fill its optional video merely for this application.

If activation succeeds, the answer should explain that HyperSync supplies real pool-event history: deposits, asset/backing exits, partial receipt replacement, provider notice and commission events, decoded into dated, explorer-linked activity. Identify the actual displayed events and verification block. The integration uses confirmation depth, block/hash provenance, a rollback guard, bounded pagination and request/response limits. It must be described as history, not as the source of current balances, receipt ownership, quotes or withdrawal rights; those remain verified RPC state.

Do not paste a completed-tense Envio answer until a live endpoint and visible feature have been verified. Do not create fake events or present another data source as Envio output.
