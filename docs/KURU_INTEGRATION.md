# Optional MON funding through Kuru

Implemented and exercised by an internal script on 16 September 2026 for **Monad testnet, chain 10143**. The feature belongs inside the Faucet page. It does not add a trading page or navigation item. A browser-signed funding-to-protection demonstration and external user validation remain outstanding.

## User journey

1. Obtain native testnet MON for gas using the existing Monad faucet guidance.
2. Expand **Buy testnet MON with Kuru** and claim Kuru's test-token bundle if needed.
3. Approve and deposit the required Kuru test USDC into the connected wallet's own Kuru account.
4. Review a live on-chain quote for **10–100 Kuru test USDC**, with a 0.5% minimum-output bound and one-minute expiry.
5. Confirm the MON purchase, then separately withdraw the MON from Kuru to the same wallet.
6. Use the existing Wrap MON and protection flows. Buying or withdrawing MON **does not open protection**.

Kuru's test USDC is `0xEe0722ead54f1B4fe97bE399Be43BC0226a6f97E`, not YieldShield TestUSDC, Circle USDC or mainnet USDC. Kuru's faucet sends a bundle of valueless test assets and no native gas. Its per-wallet cooldown is 12 hours. The connected wallet can return unused free Kuru USDC; partial progress remains recoverable after reload because the component reads the actual Kuru custody balances.

## Implementation

- [Pinned deployment](../config/kuru-testnet.json): canonical AccountCore, SpotRouter, MON/USDC OrderBook, USDC and faucet identities, including proxy implementation addresses and runtime hashes.
- [Shared contract helpers](../services/monad/kuru-contracts.mjs): direct viem reads and bounded swap construction, used by the browser and operator verification.
- [Optional funding component](../apps/monad-web/src/KuruFunding.tsx): loads account reads only after expansion; keeps each custody/trade/withdrawal action explicit.
- [Guard tests](../services/monad/kuru-contracts.test.mjs): wrong chain/target/code, changed account, altered quote, expiry, slippage, unexpected settlement and account ownership.
- [Operator smoke module](../services/monad/kuru-smoke.mjs): bounded faucet/deposit/swap/withdrawal journey with durable intent/receipt callbacks and actual recipient balance checks. Importing the module performs no work and reads no key.

The public Kuru REST catalog and finalized order book were read to establish feasibility. They do not supply transaction calldata. Executable quotes come directly from the pinned OrderBook's `estimateSwap`; execution uses its `swap` method. No API token, relay, delegated signer, EIP-7702 authorization, builder fee or new SDK dependency is required.

The documented `@toxicflow-labs/ts-sdk@0.0.1` npm metadata lists `UNLICENSED`. We inspected its public contract signatures for compatibility and independently wrote a narrow interface. Its implementation is neither installed nor copied into this repository.

## Checks before signing

The integration requires chain 10143, unchanged contract code and proxy implementations, the canonical native-MON/Kuru-USDC pair, its linked AccountCore and Router, expected decimal/precision settings, AccountCore market authorization and an active market. A registered user ID must resolve back to the connected address. The user ID and address are bound into each quote.

Only the pinned AccountCore may receive the explicit USDC allowance. Deposits use `deposit(token, amount)` for the caller's own account. Withdrawals use `withdraw(token, amount)` and pay that caller. Swap construction accepts no arbitrary spender, recipient, target, call data or additional fee.

Quotes reject incomplete liquidity, zero output, inputs outside the app's test limit, expired/future timestamps and widened output bounds. The contract enforces the minimum output and deadline during execution. The app verifies the canonical `SpotSwap` event against the reviewed account, direction, amount and limit, then checks the credited native-MON balance. Existing wallet controls provide simulation, gas reserves, selected-account checks, transaction confirmation and recovery of a pending transaction hash.

Identity checks describe the implementation observed before a transaction, not an independent security audit of Kuru or a guarantee against a later third-party upgrade. Any observed implementation change blocks new integration actions for review.

## Read-only evidence

At block **63056213** on 16 September, chain ID, all five pinned runtime hashes and the three proxy implementation slots were read from the official testnet RPC. Market reads returned native MON as base, the documented Kuru USDC as quote, the documented AccountCore, active state `0` and base-size multiplier `10000000000`.

A second helper-driven quote at block **63058645** returned:

| Field | Observed value |
| --- | --- |
| Input | 10 Kuru test USDC (`10000000` raw units) |
| Estimated output | 199.3974978 native testnet MON |
| Minimum output at 0.5% slippage | 198.400510311 MON |
| Signer account | `0xA437345Be29EC6802024A8e090E34b621b92E5E2` |
| Kuru account ID before funding | `0` |
| Faucet eligibility | `nextClaimAt = 0` |

These are expired observations, not current offers. The finalized public MON/USDC book also returned nonempty bid and ask sides for the canonical market. Neither a quote nor a test faucet eligibility check is a completed trade.

The first unthrottled combined probe encountered the public RPC's 15-request/second limit. The retry using the repository's `throttledRpcFetch` and `retryRateLimitedReads` succeeded. Operator scripts should use those wrappers; UI reads retain the app's bounded read-retry behavior. A failed read never falls back to an unverified price or a synthetic fill.

## Completed scripted transaction journey

The dedicated testnet signer completed five transactions, recorded in [the public funding evidence](evidence/kuru-funding-journey-20260916.json). A separate read-only verification matched all five receipts to canonical block hashes, checked the sender, target, nonce, status and gas fields, decoded the signed call parameters, and verified the actual `SpotSwap` event against the reviewed quote.

| Step | Transaction |
| --- | --- |
| Claim the test-token bundle | [0x4103741c…](https://testnet.monadexplorer.com/tx/0x4103741cc51fe5bdea8b499e2d9b02f7d7718c0a2b22310d45678a747c2e548c) |
| Approve exactly 10 Kuru test USDC | [0x738eb198…](https://testnet.monadexplorer.com/tx/0x738eb198ec08424052679dbf5a5824c94753fcf5794a0834a9d57b6efdb316c2) |
| Deposit into the signer's own Kuru account | [0x29a29344…](https://testnet.monadexplorer.com/tx/0x29a29344ee3e66a2b1a526bafacfab3f7a64ac0e3ae83f1a0b4ea1f963b6b2d9) |
| Buy native MON | [0xc29230b7…](https://testnet.monadexplorer.com/tx/0xc29230b7826db8f37becb670c4c3b2442e446c434d6353910dd5ec43595d5203) |
| Withdraw the acquired MON to the same wallet | [0x20c4a78d…](https://testnet.monadexplorer.com/tx/0x20c4a78db41d963648debe645331d38070f4ef6719a55e61205348bcdc01fdaf) |

The actual fill spent **10 Kuru test USDC** and credited **199.3974978 native testnet MON**, above the minimum of 198.400510311 MON. The full bought amount was withdrawn; Kuru's free MON and USDC balances finished at zero. The wallet retained 9,990 Kuru test USDC from the 10,000-token faucet allocation. These amounts have no monetary value.

The five maximum fee reservations sum to **0.2537661 testnet MON**, within the one-MON limit; actual receipt fees sum to **0.2121651 MON**. The withdrawal alone cost 0.026205534 MON. Its native-wallet reconciliation is exact: 2.078819692 + 199.3974978 − 0.026205534 = 201.450111958 MON.

This proves an **internally scripted on-chain funding journey**. It does not establish browser-wallet completion, customer trading activity, a partnership or bounty qualification. The record explicitly has `protectionOpened: false`; acquiring MON and opening protection still need to be demonstrated together through the product.

## Repeating the operator exercise

`runKuruFundingSmoke` takes an already configured read client, wallet client, account address and two required callbacks: `onIntent` and `onReceipt`. The caller must durably store each expected transaction hash and nonce before broadcasting and the corresponding receipt afterwards. Use the existing ignored deployment journal location. The module:

- Caps the sum of maximum transaction fees at **one testnet MON** and trades exactly ten Kuru test USDC.
- Claims test tokens only if the available Kuru/wallet balance needs them.
- Signs locally, calculates the expected hash, invokes the durable intent callback, then sends the signed transaction.
- Checks the actual USDC deposit debit/credit, swap event, Kuru MON credit and withdrawal back to the wallet.
- Leaves pre-existing Kuru MON untouched and explicitly reports `protectionOpened: false`.

After an ambiguous broadcast or failed receipt read, stop and reconcile the expected hash and current account state. Do not rerun the whole journey blindly. Only one process should use the dedicated signer at a time. Publish transaction hashes and balance evidence, never signer credentials or authentication sessions.

Before claiming the consumer-trading bounty, record a browser-signed acquisition followed by the existing protection flow and obtain real user-demand evidence. The bounty also evaluates target users, acquisition, retention and continuation; internal test transactions alone do not satisfy those requirements. [Market validation plan](MARKET_READINESS_2026-09-16.md).

## Primary references

Accessed 16 September 2026:

- [Metropolis Kuru consumer-trading bounty](https://hackathon.monad.xyz/tracks/build-the-next-consumer-trading-app-on-kuru).
- [Canonical Spot V2 testnet deployment](https://kuru-testnet-docs.mintlify.site/deployments/testnet).
- [Account custody and ownership](https://kuru-testnet-docs.mintlify.site/contracts/account-core).
- [OrderBook swaps and estimates](https://kuru-testnet-docs.mintlify.site/contracts/order-book).
- [Exact-input swap example](https://kuru-testnet-docs.mintlify.site/sdk/swaps).
- [Public API surfaces](https://kuru-testnet-docs.mintlify.site/api/introduction), [finalized order book](https://kuru-testnet-docs.mintlify.site/api/exchange/reference/l2-book).
- [Bounty-linked faucet instructions](https://gist.github.com/devblixt/80740a416ddc6afd2618c365b1f6cf98).
- [Published SDK metadata](https://registry.npmjs.org/@toxicflow-labs/ts-sdk/0.0.1).
