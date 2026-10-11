# Sponsor answers — factual draft, 11 October 2026

The selected bounties are **Dynamic** and **Chainlink CRE**. These answers describe the user-confirmed Dynamic-to-MetaMask scenario journeys and the successful official CRE CLI simulation. Sponsor selection does not establish eligibility or an award. The 11 October reference-price outage remains disclosed; September reference execution is historical. Kuru and Envio have been removed at the user's instruction.

## Dynamic — describe SDK authentication, wallet or signing integration

YieldShield uses the Dynamic React SDK for email authentication, embedded-wallet provisioning and existing-wallet connection on Monad testnet. The SDK loads when onboarding opens and restores a previously selected Dynamic session after reload. Its wallet client is used for explicit user signing; our read-only API holds no user signing key.

Before signing, YieldShield reacquires the selected wallet, checks the account and chain 10143, verifies the target and spender, obtains exact token approvals where needed, and simulates the action. A pending transaction hash survives reload so an interrupted flow can reconcile its receipt instead of blindly sending again.

The historical 16 September browser evidence follows Continue with Dynamic → external MetaMask: wrap 0.01 test MON, approve and protect WMON, display the receipt, reload and restore the wallet/position, then withdraw the asset and close the receipt. Canonical receipts confirm the three final transactions and the receipt NFT burn. A fresh 11 October Dynamic-to-MetaMask browser test deposited 1 sMON-demo, recovered the wallet and receipt after reload, withdrew 0.5 sMON-demo with receipt replacement, then received 55.269586 TestUSDC through the backing exit. The provider journey deposited 10 TestUSDC, started the two-minute withdrawal notice, and withdrew the full available 9.999999 TestUSDC after maturity, burning junior receipt 2. Canonical state confirms zero remaining position balance and shares; the one-base-unit difference from the deposit is share-conversion rounding. These are user-confirmed Monad testnet transactions. Email-based embedded-wallet signing is configured but is not claimed as exercised by this evidence.

Current six-transaction evidence: https://github.com/YieldShield/yieldshield-monad/blob/codex/hackathon-readiness-2026-10-11/docs/submission-2026-10-11/evidence/browser-transactions-20261011.json

Historical reference-market browser evidence: https://github.com/YieldShield/yieldshield-monad/blob/ef194f7/docs/DYNAMIC_BROWSER_CHECK.md

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

## Kuru — excluded for now

**Removed from bounty selections at the user's instruction on 11 October.** The current deployment migration and live quote checks remain in the product, but no funded current-token trade or complete browser acquisition-to-protection journey has been verified. The owner has no current Kuru test USDC. Do not re-add the bounty or present the historical September transactions as current execution. Prior draft answers remain recoverable in Git history. [Integration status](../KURU_INTEGRATION.md).

## Envio — selection decision

**Remove from bounty selections, as explicitly instructed by the user on 11 October.** The newer repository implements an Envio HyperSync-backed transaction-history feature, but the September release says no API token was configured and the history panel was hidden. Installed code alone does not meet the portal's stated requirement. Do not activate Envio or fill its optional video merely for this application.

If activation succeeds, the answer should explain that HyperSync supplies real pool-event history: deposits, asset/backing exits, partial receipt replacement, provider notice and commission events, decoded into dated, explorer-linked activity. Identify the actual displayed events and verification block. The integration uses confirmation depth, block/hash provenance, a rollback guard, bounded pagination and request/response limits. It must be described as history, not as the source of current balances, receipt ownership, quotes or withdrawal rights; those remain verified RPC state.

Do not paste a completed-tense Envio answer until a live endpoint and visible feature have been verified. Do not create fake events or present another data source as Envio output.
