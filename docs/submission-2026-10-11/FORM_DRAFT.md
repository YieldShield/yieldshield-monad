# Metropolis submission — prepared 11 October 2026

Draft only. The portal has no separate Submit step: saving every required field automatically switches it to “Ready for judging.” To honor the user’s instruction, the saved pitch-video field is deliberately blank; its completed URL is listed below and can be left filled but unsaved in the editor. Do not save that final field until the user authorizes readiness. Refresh the dated execution evidence against the final release before saving claims about current health. The portal deadline observed on 11 October is **14 October 2026, 05:59 Europe/Berlin (GMT+2)**. Envio is removed from the intended bounty selections at the user's instruction.

**Current operational limitation, 11 October:** the external MON price feed is stale, so the five WMON/shMON reference pools are disabled by the application's freshness checks. The two isolated scenario pools remain the demonstration path while the upstream-feed issue is investigated. Do not describe reference-pool actions as currently working until fresh end-to-end verification supports that claim. A browser-signed deposit of 1 sMON-demo succeeded today: `0xfaa67eac0366b3c21a2fb9c93b238cf55aacfb482c165089af6e165e08532256`.

## Project name

YieldShield on Monad

## Short description

Two exit choices for MON and shMON holders: keep the remaining asset, or surrender it for an eligible backing payout. Backing providers take first losses and earn a share of realized gains.

## Project description

YieldShield gives MON and shMON holders a way to keep crypto exposure while retaining a defined alternative exit. A holder deposits an asset into a pool backed by capital supplied by other participants. When leaving, the holder can withdraw the remaining asset after gain-sharing fees, or surrender it for an eligible payout in the pool's backing token. Backing providers earn a share of realized gains and accept first-loss risk.

The Monad testnet application includes native MON wrapping, shMON staking, protected positions, provider positions and withdrawal notices, explicit asset identities, and wallet confirmations through Dynamic. There are seven funded test pools in total: five reference pools for WMON and shMON with TestUSDC, test-vault shares or official Agora testnet AUSD, and two isolated scenario pools. RedStone supplies the configured MON/USD reference; shMON uses conservative withdrawal NAV. As of 11 October, the upstream MON feed is stale and those five reference pools are disabled; the scenario pools remain the current demonstration path. Signed-update recovery requires RedStone gateway access, which is not yet available. The optional Kuru funding flow has been migrated to the current testnet deployment, with old-account withdrawals preserved. Its new test USDC requires Kuru-issued access and its book has limited test liquidity; no fresh funded trade is claimed. A Chainlink CRE workflow compares public API observations with same-block pool and oracle reads on Monad.

The release evidence records 44 named contracts, three scripted holder/provider journey suites, a Dynamic-to-MetaMask browser journey, five Kuru funding transactions and a successful official CRE CLI simulation. These are internal tests with valueless testnet assets; they are not customer adoption, revenue or real-money TVL. CRE is demonstrated through local simulation, not a continuously deployed DON monitor.

YieldShield existed before Metropolis. We reused the protocol/accounting and receipt-NFT foundation; the new milestone is the Monad application, deployment, asset and sponsor integrations, and reproducible test evidence. The public repository preserves attribution, license notices and a file-level reuse disclosure. OpenAI Codex assisted with code, tests, documentation and debugging.

Protection is subject to the pool's backing cap, fees, waiting periods and available backing. It is not a cash guarantee. Previously settled gain-sharing fees are not refunded after a later price decline.

## Go-to-market plan

Start with existing MON and shMON holders who want to retain exposure but have recently considered selling or hedging because of downside. Recruit a separate group of experienced DeFi liquidity providers: the market only works if they accept the first-loss economics and capital reservation.

The next validation cohort is six holders and four potential providers. We will observe a complete testnet deposit and exit, ask participants to explain the surrendered asset, payout cap and provider loss role, and record completion rates and points of confusion. We will measure whether participants return for a second session and whether providers can identify terms at which they would supply backing. This is a proposed validation plan; no completed external interviews, repeat-user cohort or committed liquidity partners are claimed.

Initial acquisition will focus on founder-led introductions within the Monad and staking communities, educational walkthroughs, and a clear optional Kuru-to-protection journey. Retention should come from understandable position management and useful exit choices, rather than reward-driven transaction counts. The current protocol allocates a share of realized positive gains to providers, pool creators and the protocol; there is no reported revenue. Mainnet expansion will depend on user/provider validation, additional security review and an explicit launch-readiness decision.

## Judge access instructions

Open https://monad.yieldshield.ai/ — browsing requires no account. Use a test wallet on **Monad testnet, chain 10143**, and obtain native test MON for gas from https://faucet.monad.xyz/. While the MON reference feed is stale, use **Continue with Dynamic → existing MetaMask wallet → Faucet → claim scenario test tokens → Protect → sMON-demo/TestUSDC → Positions**. The scenario token follows an explicitly synthetic price cycle; it is not live MON or Kintsu sMON. On 11 October, the browser test confirmed a 1 sMON-demo deposit, wallet/receipt recovery after reload, a 0.5 sMON-demo partial withdrawal with a replacement receipt, and a 55.269586 TestUSDC backing payout that closed the remaining receipt. The provider journey deposited 10 TestUSDC, started the two-minute withdrawal notice, and withdrew the full available 9.999999 TestUSDC after maturity, burning junior receipt 2. Canonical state confirms zero remaining position balance and shares; the one-base-unit difference from the deposit is share-conversion rounding. Review the available exit and its displayed conditions before signing. The historically verified reference journey is wrapping 0.01 MON, protecting WMON/TestUSDC and withdrawing the asset; its September success does not override a currently disabled market.

Review the pool's displayed terms before approving or signing. The holder supplies the selected asset; backing is already supplied by providers. The asset exit and the backing exit are alternatives that close the same receipt. To try the backing exit, use a separate position and wait for its displayed timer. The tested scenario pool uses a 60-second backing-exit delay and a two-minute provider withdrawal notice. For the provider journey, claim TestUSDC on Faucet, deposit a small amount under Provide, and inspect the notice and available excess backing on Positions. A matured notice does not release capital reserved for holders. All six user-confirmed transactions and canonical receipt/state checks: https://github.com/YieldShield/yieldshield-monad/blob/codex/hackathon-readiness-2026-10-11/docs/submission-2026-10-11/evidence/browser-transactions-20261011.json. The 11 October fixes and dated evidence are in https://github.com/YieldShield/yieldshield-monad/pull/58.

TestUSDC is not Circle USDC; testnet AUSD and all demonstration balances have no monetary value. If a price or contract check disables an action, inspect Network status and the displayed reason. Documentation and transaction evidence: https://github.com/YieldShield/yieldshield-monad/blob/main/docs/JUDGE_QUICKSTART.md

## Team / company

David Hawig and Santi. YieldShield is operated by Hawig Ventures UG (haftungsbeschränkt), Germany. David previously served as Director of Ecosystem at Web3 Foundation and founded a startup. Santi's background and detailed responsibilities have not been supplied; do not invent them. Contact: david@yieldshield.ai.

## Funding / awards

No prior funding or awards, as supplied by David. Prior participation or overlapping-event submissions have not been established and need a factual answer if the form asks.

## Links

- Application: https://monad.yieldshield.ai/
- Repository: https://github.com/YieldShield/yieldshield-monad
- Product guide: https://monad.yieldshield.ai/how-it-works
- X: https://x.com/yieldshield_ai
- Existing 2:08 supporting explainer: https://monad.yieldshield.ai/media/how-it-works-20260916-v2.mp4
- Technical demo (1:59): https://monad.yieldshield.ai/submission-videos.html?video=technical
- Team pitch (1:17): https://monad.yieldshield.ai/submission-videos.html?video=pitch
- CRE simulation (1:08): https://monad.yieldshield.ai/submission-videos.html?video=cre
- Separately committed fixes and final materials: https://github.com/YieldShield/yieldshield-monad/pull/58

## Evidence source and current limitations

Draft checked against fresh `origin/main` snapshot `d239fd71a41289f70a53efff8491bb4e7ae3ac17` in the readiness worktree. Its September evidence is historical, not a fresh production verification. New 11 October browser findings are stated separately above.

Relevant files in the newer snapshot: `docs/SPONSOR_RELEASE_2026-09-16.md`, `docs/DYNAMIC_BROWSER_CHECK.md`, `docs/KURU_INTEGRATION.md`, `docs/CHAINLINK_CRE.md`, `docs/MARKET_READINESS_2026-09-16.md`, `docs/PUBLICATION.md` and `docs/HACKATHON_DELTA.md`.

The evidence verifies Dynamic's external MetaMask path; email-based embedded-wallet signing remains unverified. Kuru's recorded trade is internally scripted, with `protectionOpened: false`. The September book was empty on 11 October; a migration now targets the current deployment, whose limited liquidity and newly issued test token require separate verification. The owner has confirmed no current Kuru test USDC, so a fresh funded trade and a complete browser buy-then-protect recording remain outstanding. Completed shMON external unstaking is not established. Envio was unconfigured and its panel hidden; the user has instructed that it be removed from bounty selections.
