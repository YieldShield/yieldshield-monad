# Dynamic browser wallet check

On 16 September 2026, the production application completed a real browser journey on Monad testnet through **Continue with Dynamic → external MetaMask wallet**. This verifies the Dynamic connector path; it does not establish that email-based embedded wallets were exercised.

1. Wrapped 0.01 test MON and observed the WMON balance refresh.
2. Approved and protected 0.01 WMON in the WMON/TestUSDC pool. Receipt #2 appeared under Positions.
3. Reloaded the page. Dynamic restored the connected wallet and the position appeared again.
4. Withdrew the asset and closed the position. The application displayed the confirmed transaction and closed-position state.

The three final transactions were independently checked against sealed canonical RPC receipts and their block hashes. All succeeded. The receipt NFT was burned on exit. Exact transactions, transferred amounts and observations are in [the public evidence](evidence/dynamic-browser-journey-20260916.json).

This is an internal test using valueless testnet assets, not customer adoption. It is also not a recording: the final technical demo still needs a live product walkthrough uploaded to a host accepted by Metropolis.
