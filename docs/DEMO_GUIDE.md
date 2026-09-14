# Judge walkthrough and three-minute video script

Both `scenario-journey.json` and `reference-journey.json` now contain confirmed testnet evidence. A public 2:34 narrated screenshot overview is available at https://monad.yieldshield.ai/evidence, with captions and a transcript. It does not show live wallet signing. The outline below remains the plan for an enhanced live transaction recording after the Dynamic walkthrough. Do not fill transaction links or adoption metrics with invented data.

## Prepare

Use a separate browser wallet on Monad testnet 10143, obtain valueless gas, then use Test assets for TestUSDC and sMON-demo. Wrap native MON for the reference market and, if showing it, stake native MON through the actual shMON router. Open one protected receipt in advance, allow its 60-second wait to mature, and prepare a junior receipt with a matured notice. Explain these preparation steps verbally.

Check the fresh on-chain RedStone MON price and ensure the API is healthy. Confirm the faucet and exchange inventory, network names, contract addresses, video permissions and source repository visibility. Avoid showing wallet recovery phrases, secret API keys, sign-in screens or unrelated tabs.

## Recording outline — 2 minutes 55 seconds

| Time      | Screen and message                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Home: “YieldShield gives a holder two exit choices. Another participant supplies first-loss backing and earns a share of realized gains.” Identify Monad testnet and valueless tokens.                   |
| 0:20–0:50 | Reference market: show WMON, its externally sourced MON price, TestUSDC backing, capacity and gain-sharing fee. Explain that the test dollar token is not Circle USDC.                                   |
| 0:50–1:15 | Protect: approve the exact amount, open a small position, and show its confirmed receipt. If confirmation takes longer, cut waiting time transparently and retain the hash.                              |
| 1:15–1:50 | A prepared mature receipt: compare the remaining-asset exit with the backing payout. Execute the backing exit and show received backing. State that the holder surrenders the remaining deposited asset. |
| 1:50–2:10 | Junior position: show remaining backing, reserved amount, rewards and notice. Explain first-loss exposure; notice does not release committed capital.                                                    |
| 2:10–2:30 | Scenario lab: move the loss/gain controls. If showing a synthetic execution, keep the scenario label visible. Never relabel scenario data as live MON.                                                   |
| 2:30–2:45 | Status: show price provenance and a real blocked-action example or explain the visible validation condition. Do not manufacture an outage in the production service for the video.                       |
| 2:45–2:55 | Source/evidence: point to the public repository, reuse disclosure, testnet receipts and shMON integration. Close with the completed milestone and next user-validation question.                         |

The script allocates time; it is not a claim the full workflow has been recorded or executed. Keep the final public file ≤3:00, with readable amounts and subtitles.

## Browser acceptance record to complete before the final video

- Disconnected visitor can understand the two roles and browse without signing in.
- Desktop and phone-width layouts are legible; navigation, wallet dialog and forms work by keyboard.
- Wrong network/account and user rejection show an actionable message.
- A pending transaction remains visible after reload; do not duplicate it.
- Both holder exits and a partial exit have correct recipient balances and receipt lifecycle.
- Junior claim, partial/full excess withdrawal and notice restart are demonstrated; reserved backing is not treated as available.
- Stale reference data blocks dependent actions; scenario prices remain isolated.
- Vault payout is in shares, followed by a separate actual redemption.
- shMON stake and epoch-based unstake are shown separately; do not promise immediate redemption.

## User validation after the technical release

The original plan proposed five holder interviews, three potential junior-provider interviews and ten observed walkthroughs. These have not been performed. Ask users to explain the surrendered asset, payout cap and junior loss role in their own words, then observe the supported path. Record real outcomes and issues, with permission, before making usability or traction claims. Outreach is not authorized by this implementation task.
