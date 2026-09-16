# YieldShield: market readiness for Metropolis

Research date: **16 September 2026**. This is a decision and validation plan, not evidence of customer adoption. All external sources below were accessed on that date. Outreach drafts have **not** been sent.

## Decision

Start with **MON and shMON holders who want to keep exposure but want a defined alternative exit when prices fall**. Recruit a separate group of experienced DeFi liquidity providers to test whether supplying the backing makes economic sense. One willing side does not establish a market.

The strongest submission would show a complete wallet journey, users who understand the tradeoff, and providers who can explain when they would supply capital. Additional asset names and sponsor logos are weaker evidence.

The Onchain Finance & Trading rubric weights founder/market readiness at 25%, traction/path forward at 20%, technical execution at 20%, design at 20%, and originality at 15%. These weights were recorded in the signed-in [track page](https://hackathon.monad.xyz/tracks/onchain-finance) on 16 September. Recheck before submitting.

## Facts, interpretation and hypotheses

| Status | Finding | Consequence |
| --- | --- | --- |
| Product fact | Seven funded pools and 44 named contracts are deployed on Monad testnet. The repository documents internal transaction evidence. | Demonstrates execution. Test balances are not real-money TVL, revenue or customer demand. [Release evidence](METROPOLIS_SUBMISSION.md). |
| Ecosystem fact | shMON represents a share of staked MON; its exchange rate incorporates staking and other revenue. shMonad describes both delayed unstaking and an instant path with fees. | A holder can earn more MON while still caring about MON's value in a backing asset. Withdrawal NAV and executable market price can differ. [shMonad overview](https://docs.shmonad.xyz/liquid-staking/), [staker FAQ](https://docs.shmonad.xyz/staker-faq/). |
| Ecosystem fact | Kuru offers spot trading and aggregation on Monad. Perpl's official API documentation lists a MON perpetual market on mainnet and testnet. | There are real alternatives to simply holding exposure. YieldShield must explain why its tradeoff is useful. [Kuru](https://docs.kuru.io/), [Perpl market documentation](https://github.com/PerplFoundation/api-docs). |
| Interpretation | Existing MON/shMON users are a more credible initial segment than “everyone who wants safe yield.” | Recruit people with a recent decision about holding, selling or hedging; do not recruit only hackathon reward seekers. |
| Unvalidated hypothesis | Some holders prefer sharing positive gains over managing a separate hedge or selling their exposure. | Ask about their last actual decision before presenting YieldShield. Test a concrete alternative, not a leading “would you use this?” question. |
| Unvalidated hypothesis | Some providers will accept first-loss exposure, capital reservation and protected-asset rewards at viable terms. | Treat this as the most important commercial unknown. Do not promise a provider APY or subsidize a test and call it organic demand. |

**Current evidence boundary:** no external interviews, repeat users, committed liquidity partners, paid customers or outside funding are established in this packet. Founder-provided facts: David previously served as Director of Ecosystem at Web3 Foundation and previously founded a startup; Santi is his co-founder. Santi's responsibilities and background must be supplied by the founders.

## Initial customer and job

**Holder:** an existing Monad user who already holds MON or shMON, expects to keep some exposure, and has recently considered reducing it because of downside. The proposed job is: “Show me what I give up and what I can receive if I decide to leave through the backing side.”

**Provider:** an experienced DeFi allocator who can evaluate a pool's loss exposure, exit constraints and reward denomination. The proposed job is: “Show me the capital I must reserve, the scenarios in which I lose, and the compensation for accepting them.” Do not start by marketing the junior side as a savings product.

Use WMON/TestUSDC or WMON/AUSD as the simplest explanation, then show shMON as the Monad-specific extension. Testnet AUSD is a valueless test token, and TestUSDC is not Circle USDC. Keep catalog-only syrupUSDC, sUSDe, USDe, earnAUSD and other mainnet research entries out of transaction-support claims. [Current scope](../README.md).

## Alternatives and the tradeoff we need to prove

Comparisons describe mechanisms, not recommendations or claims that every product supports MON. Sources accessed 16 September 2026.

| Alternative | What it does | Question YieldShield must answer |
| --- | --- | --- |
| Sell some MON into a stablecoin | Reduces exposure through a spot trade. Kuru provides Monad spot execution and aggregation. [Kuru swap](https://docs.kuru.io/product/swap). | Why keep this exposure and share future gains instead of simply selling part of it? |
| Hold shMON | Accumulates staking-related value in MON terms; the exchange rate is not a stable-dollar promise. [shMonad FAQ](https://docs.shmonad.xyz/staker-faq/). | Does the backing exit solve a price-risk concern without confusing it with staking yield or instant unstaking? |
| Hedge with MON perpetuals | Perpl lists MON markets. Funding payments can flow in either direction and affect the position's return. [Markets](https://github.com/PerplFoundation/api-docs), [funding](https://docs.perpl.xyz/exchange/funding). | Is the gain-sharing/reserved-backing tradeoff preferable to managing a separate margined hedge? Do not claim the hedge always costs money. |
| Buy a put option | A conventional put gives a defined strike and expiry in exchange for a premium. Deribit's cited European options exercise at expiry; positions can be traded earlier. MON is not in that page's listed linear option contracts. This is a conceptual comparator, not a verified MON execution route. [Deribit specifications](https://support.deribit.com/hc/en-us/articles/31424932728093-Linear-USDC-Options). | Does avoiding a fixed expiry and upfront premium justify sharing gains and accepting YieldShield's conditions? |
| Separate principal and yield | Pendle splits yield-bearing assets into PT and YT; PT redemption is tied to its accounting asset and maturity. This alone is not an independent dollar floor for MON. [Pendle explanation](https://docs.pendle.finance/pendle-academy/pendle-101/pendle-101-key-takeaways). | Are we explaining a different risk transfer, rather than calling ordinary yield tokenization “protection”? Monad availability of a relevant market was not verified here. |
| Senior/junior yield tranches | Strata describes two risk tranches, including products built on Ethena's USDe/sUSDe exposure. [Strata documentation](https://docs.strata.markets/). | Risk separation is established prior art. Differentiate the holder's two exit choices, independently supplied backing and the implemented Monad journey. Do not claim invention of tranching; Monad deployment was not verified here. |

## Provider economics: what to validate first

Current pools charge **10% to providers, 1% to the creator and 1% to the protocol on realized positive gains**, paid in the protected asset. A backing exit gives up the remaining protected position; that asset is allocated to provider rewards while backing pays the holder. Notice maturity alone does not free capital reserved for active protection. Fees already paid are not refunded after a later loss. [Product terms](../README.md), [fee implementation](../contracts/contracts/base-modules/BasePoolFeesModule.sol), [backing-exit implementation](../contracts/contracts/base-modules/BasePoolShieldExitModule.sol).

The following is a **single-position arithmetic illustration**, not a forecast or APY. Assume a protected position initially worth 100 units, 150 stable backing units, no prior fee realization, unchanged backing value, no transaction costs, no other positions, and a valid eligible exit. Values of received protected tokens are marks, not realized sale proceeds.

| Terminal case | Holder | Provider's combined marked value |
| --- | --- | --- |
| Protected asset rises 20%; holder takes asset exit | 120 less 2.4 gain-sharing fees = 117.6 | 150 backing + 2 in protected-asset fees = 152; creator and protocol each receive 0.2 |
| Protected asset falls 20%; holder chooses backing exit | Receives 100 backing; surrenders the remaining asset | 50 backing + surrendered asset marked at 80 = 130 |
| No gain and no backing exit | No positive-gain fee in this simplified case | No gain-share income; backing may still be reserved |

The profitable example gives the provider 2/150, or **1.33% for that hypothetical event**, before expenses and future losses. It is not an annual return. This illustrates why “10% of gains” should never be presented as “10% yield.” Prior fees, different collateralization, backing depegs, redemption costs and multiple positions change the result.

Ask each provider candidate:

1. What investment would this replace, and what actual return/risk constraint applies to it?
2. Would they accept rewards and surrendered inventory in MON/shMON rather than stablecoins? Who bears conversion costs?
3. How much duration uncertainty is acceptable while protected positions reserve backing?
4. Which loss, backing-depeg and LST-discount scenarios rule it out? What concentration limit would they require?
5. Does the current gain share compensate them in flat or falling markets? What specific term would need to change?
6. What evidence would they require before even considering a capped real-money pilot?

Record objections without changing protocol economics during an interview. Build any later scenario model around actual fee timing, native-token caps, cash flows and conservative redemption values. It must distinguish assumed prices, simulated results and realized transactions.

The business model also needs this discipline: the **1% protocol share is a share of realized gains, not of TVL**. The illustrative 20-unit gain yields only 0.2 to the protocol. Do not turn testnet activity or annualized hypothetical turnover into revenue forecasts.

## First ten observed sessions

**Proposed sample:** six MON/shMON holders and four experienced liquidity providers, external to the team. At least two holder sessions should use a phone. Recruit participants because of relevant behavior, not token balances they are willing to disclose. No deposit of real funds is needed.

**Thirty-minute format**

| Minutes | Activity |
| --- | --- |
| 0–5 | Ask for the last real holding/hedging or liquidity-allocation decision. What happened, what alternative did they use, and what cost or problem remained? Ask permission before recording or quoting. |
| 5–8 | Let them read the page silently. Ask them to explain the two roles, fee basis and what the backing exit gives up. Do not teach first. |
| 8–20 | Holder: connect a test wallet, find the faucet, choose a reference market, review terms, sign a small test deposit and locate the receipt. Compare exits using an eligible prepared position, disclosed as such. Provider: find backing requirements, deposit test backing, locate rewards/reservations and explain the notice/withdrawal constraint. |
| 20–25 | Give a falling-price example and a rising-price example. Ask what each party receives and what can still go wrong. Record mistakes before correcting them. |
| 25–30 | Compare with their actual alternative. Ask what would stop them returning and request a second test only if useful to them. Record concrete next steps separately from compliments. |

Use an anonymous record per participant: segment; recent behavior; device; tasks attempted/completed; help needed; time; transaction IDs if consented; misconceptions; severity; alternative chosen; specific follow-up permission. Store identifiable notes outside the public repository. Report counts and denominators; ten sessions cannot establish market size or statistical product-market fit.

**Proposed success criteria, not achieved results:**

- Complete ten sessions and publish an anonymized issue summary before the final demo.
- At least 5/6 holders correctly explain surrender of the asset, the payout cap and gain-based fees after reviewing the interface; any false “guaranteed dollars” interpretation is a product issue.
- At least 5/6 holders complete the test deposit and find their receipt without the facilitator taking control. Record failures even if a retry succeeds.
- All four provider candidates understand first-loss exposure and reserved backing; at least two give a specific, conditional reason to join a later pilot, including required terms. A conditional statement is not committed capital.
- Ask all participants whether a follow-up would help; seek three voluntary return tests within seven days. Do not count founder wallets as retention.
- Measure app-to-confirmed-result time separately from wallet decision time. Target a visible usable initial page within three seconds and usable pool data within five seconds at the 95th percentile across a recorded sample of 20 cold/warm loads; these are targets, not current performance claims.

If provider interest depends entirely on subsidies, or holders cannot understand the tradeoff after a revision, narrow the scope and repeat the relevant sessions before proposing a funded pilot.

## Recruitment and partner pipeline

These are **research candidates**, with no contact, endorsement or partnership implied. Use public community/mentor channels; ask permission before recruiting in someone else's community.

| Candidate/channel | Why it fits | First request | Evidence to retain |
| --- | --- | --- | --- |
| shMonad/FastLane community | Existing shMON users match the first holder segment. [Official overview](https://docs.shmonad.xyz/liquid-staking/). | Permission to recruit three holders for 30-minute testnet sessions; one technical review of how we describe withdrawal NAV. | Permission, completed sessions and corrected assumptions. |
| Kuru community/builders | Spot users already decide whether to buy, hold or sell MON. [Official product](https://docs.kuru.io/). | Three volunteers who recently changed MON exposure; feedback on whether an optional buy-then-protect step is useful. | Recent behavior and observed flow results; no inferred partnership. |
| Perpl ecosystem participants | Experienced MON hedgers can explain the alternative and its constraints. [Official market list](https://github.com/PerplFoundation/api-docs). | Two interviews comparing existing hedge management with the proposed backing role. | Specific objections and term requirements; do not assume traders will provide backing. |
| Metropolis finance mentors | Suitable route to feedback on provider economics and the scope of new work. [Mentors](https://hackathon.monad.xyz/mentors). | Review a one-page payoff example and reuse disclosure once update-based access is unlocked. | Feedback and changes, with permission to quote. |
| Existing founder network | David's ecosystem experience may make relevant introductions possible; no access or endorsement is assumed. | Two experienced DeFi allocators willing to challenge the economics. | Actual introductions and completed conversations only. |

**Holder recruitment draft — not sent**

> We're testing a Monad app for people who hold MON or shMON and have thought about reducing their exposure. It lets a holder keep the asset exposure or leave through separately supplied backing, with tradeoffs around fees and payouts. We'd like to watch you try the testnet version for 30 minutes and hear where it doesn't make sense. No real funds, purchase or endorsement involved. Would a session be useful to you?

**Provider research draft — not sent**

> We're building YieldShield on Monad and need a critical view of the backing side. Providers receive a share of realized gains and accept first-loss exposure; capital can remain reserved while positions are active. We're looking for someone who has evaluated DeFi liquidity strategies to challenge the terms and a few loss scenarios. Could we show you the testnet build for 30 minutes? We're asking for feedback, not capital.

**Mentor request draft — not sent**

> We've deployed YieldShield's Monad testnet milestone and documented the protocol foundation we reused. Our main open question is whether the provider compensation makes sense for the risk and capital commitment. Could you review a short payoff example and help us identify the strongest validation test? We'd also appreciate feedback on presenting the new Monad work clearly for judging.

## Thirty, sixty and ninety days

Dates are proposed checkpoints from 16 September, not delivery commitments or a promised mainnet launch.

| Checkpoint | Work | Decision gate |
| --- | --- | --- |
| By submission, internal target 12 October | Ten sessions; wallet signing evidence; honest before/after performance measurements; one concise progress update per completed milestone; two founder-recorded pitch minutes; public technical demo ≤3 minutes. | All claims link to evidence. Recheck final form and external video access. |
| Day 30: 16 October | Summarize segment response and provider terms; prioritize one repeatable reference-market journey; publish measured integration outcomes. | Continue the selected segment only if both sides understand and value the mechanism. Otherwise revise scope and test again. |
| Day 60: 15 November | Repeat the pilot with returning testers; commission independent contract/economic review; obtain advice on the intended real-money offering and jurisdictions; document operations and incident response. | No transition to real funds until review findings, operating responsibilities and offering constraints are resolved. |
| Day 90: 15 December | Decide whether a tightly capped pilot is justified; secure explicit provider commitments and user terms if proceeding; keep testnet if not. | Written go/no-go based on evidence and review, not the calendar or a hackathon award. |

## Sponsor work should answer a user problem

- **Dynamic:** prove first sign-in, signed deposit, reload/reconnect and correct receipt ownership. Count successful external journeys, not SDK imports.
- **Envio:** use indexed activity to make history understandable and reduce unnecessary RPC work. Measure coverage, index lag and loading before/after. Indexes do not replace fresh chain validation before signing.
- **Chainlink CRE:** demonstrate useful pool/oracle monitoring with successful execution evidence. An alert is operational support, not insurance or automatic recovery.
- **Kuru:** validate the need for optional asset acquisition before enlarging the product. If implemented, prove the actual received asset reaches the correct supported protection flow. A link alone is not an integration.

These are success criteria for the parallel sponsor work, not a claim that every integration is deployed. The live implementation record and [sponsor strategy](SPONSOR_STRATEGY.md) remain authoritative.

## What the judges should be able to inspect

One short narrative: who the first holder is; why a provider accepts the other side; what worked in observed sessions; what remains unproven; what changed during Metropolis. Link the public app, a real wallet demonstration, anonymized findings, current code and [new-work disclosure](HACKATHON_DELTA.md).

The defendable Monad story is the native asset and staking workflow, public on-chain settlement, and measured usability. Monad documents EVM compatibility and fast finality; do not equate network specifications with our application's end-to-end speed. [Monad developer overview](https://docs.monad.xyz/introduction/monad-for-developers), accessed 16 September 2026.
