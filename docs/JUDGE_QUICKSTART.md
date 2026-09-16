# Judge quickstart

Updated 16 September 2026. [Open YieldShield](https://monad.yieldshield.ai/) · [Source](https://github.com/YieldShield/yieldshield-monad) · [How it works](https://monad.yieldshield.ai/how-it-works)

**Monad testnet only, chain 10143. All assets in this walkthrough have no monetary value.** Use a test wallet. The shortest verified path is **Dynamic → MetaMask → wrap 0.01 MON → protect WMON → withdraw the asset**.

## Try the holder journey

1. **Get gas first.** Obtain native test MON from the [Monad faucet](https://faucet.monad.xyz). In the app, connect with **Continue with Dynamic**, choose your existing MetaMask wallet and confirm Monad testnet. Keep enough native MON for several transactions; the 0.01 amount below is the asset deposit, not the gas budget.
2. **Wrap a small amount.** Open [Faucet](https://monad.yieldshield.ai/faucet#wrap-mon), expand **Wrap or unwrap MON** under **Prepare other assets**, enter **0.01**, and select **Wrap MON**. Confirm the WMON balance refreshes. This is YieldShield's testnet wrapper; do not substitute a different WMON token.
3. **Open protection.** Go to [Protect](https://monad.yieldshield.ai/protect), select **WMON / TestUSDC**, and enter **0.01 WMON**. Review entry value, backing reserved, gain-sharing fee and the backing-exit waiting period. Select **Approve & protect** and confirm the wallet requests. The holder needs WMON and gas; TestUSDC is supplied by the pool's backing providers.
4. **Find the receipt.** Open [Positions](https://monad.yieldshield.ai/positions), then your protected WMON position. Check the remaining asset, recorded entry value and maximum reserved backing. Reloading should restore the connected Dynamic wallet and position.
5. **Compare the two exits before choosing.** **Withdraw asset & close** returns the remaining WMON after realized-gain fees. **Surrender asset & receive backing** gives up that WMON for a payout capped by recorded entry value and reserved backing, after the displayed waiting period. Both close the receipt: they are alternatives, not two payouts. The current reference pool's backing wait is 60 seconds; follow its displayed timer. For the verified short path, choose the asset exit and check the confirmation and closed position.

The reference pool charges **12% of realized positive gains**: 10% for providers, 1% for the creator and 1% for the protocol, paid in WMON. This is not 12% of the deposit. Previously settled fees are not refunded after a later price decline. [Full mechanics](https://monad.yieldshield.ai/how-it-works).

If the app reports stale prices or insufficient capacity, inspect [Network status](https://monad.yieldshield.ai/status) and the displayed reason before continuing. A disabled action is not a completed transaction.

## Inspect the provider side

On [Provide liquidity](https://monad.yieldshield.ai/provide), select the same pool. To try a deposit, first claim TestUSDC on [Faucet](https://monad.yieldshield.ai/faucet), then enter a small backing amount and select **Approve & provide**. TestUSDC is a demonstration token, not Circle USDC.

Providers absorb losses first. They share 10% of realized gains, with rewards paid in WMON; this is not a promised APY. On their position, inspect **Available excess backing** and **Claimable asset rewards**. Withdrawal requires notice and can release only unreserved backing. The current testnet notice is 120 seconds; notice does not unlock backing already committed to holders.

## What has actually been checked

The production [Dynamic browser check](DYNAMIC_BROWSER_CHECK.md) completed wrapping, protection, receipt display, wallet restoration after reload, and asset withdrawal on 16 September. [Transaction evidence](evidence/dynamic-browser-journey-20260916.json) confirms receipt #2 was closed and burned. This was an internal test, not customer adoption. **Embedded email wallets were not exercised**, and this browser record does not establish the backing-exit or provider journeys; separate scripted checks are described in the [submission packet](METROPOLIS_SUBMISSION.md).

## Technical demo shot list — 2 minutes 55 seconds

Record a real browser journey. Fund gas beforehand. If showing a backing exit too, prepare a **second** small position and let its wait mature; disclose that preparation. Trim confirmation waits visibly rather than implying instant execution.

| Time | Screen and talking point |
| --- | --- |
| 0:00–0:15 | Home: “A holder can keep the remaining asset or surrender it for eligible backing. This is Monad testnet.” |
| 0:15–0:35 | Dynamic connection and Faucet: show the existing-wallet path and wrap 0.01 MON. |
| 0:35–1:05 | Protect: show WMON/TestUSDC, the amount, fee, backing cap and waiting period; sign and show confirmation. |
| 1:05–1:25 | Positions: open the receipt, reload, and show wallet and position restoration. |
| 1:25–1:55 | Show both exit cards, then execute the asset exit. If time permits, use the disclosed second position for the backing exit; never suggest the same receipt pays twice. |
| 1:55–2:20 | Provide: explain the gain share, first-loss risk and restriction to unreserved withdrawals. Showing the terms is sufficient; do not imply an unperformed provider deposit. |
| 2:20–2:40 | Optional sponsor segment below, or spend this time showing the exit receipt and explorer confirmation. |
| 2:40–2:55 | Source and [reuse disclosure](HACKATHON_DELTA.md): existing Base foundation, new Monad work, AI assistance. Close with the next validation step. |

**Optional sponsor segment: choose one; do not extend the runtime.** Dynamic already appears in the core journey. Kuru has a [completed internal funding script](KURU_INTEGRATION.md) with five confirmed transactions; show that evidence honestly, or record the actual optional Faucet flow after confirming it is available in the deployed app. Buying MON does not open protection. Envio activity history and Chainlink CRE should be demonstrated only after live evidence exists; this guide does **not** claim either is live or that CRE is a deployed DON monitor.

Keep wallet secrets and authentication codes out of the recording. Retain visible confirmations and readable transaction links. Upload a version under three minutes to YouTube, Loom or Vimeo and check signed-out playback. Record the separate, maximum-two-minute founder pitch using the [David and Santi pitch guide](FOUNDER_PITCH_GUIDE.md).
