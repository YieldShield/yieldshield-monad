# Metropolis progress updates — 16 September 2026

Posted privately through the authenticated Metropolis project workspace at the owner's explicit request. These are current milestone reports, not backdated posts or final submission. Sponsor integrations described as in progress were not represented as completed.

## Posted: working Monad milestone

The Monad build is live, and we’ve now made the repo public.

We’re building YieldShield for people who want to hold MON or shMON with collateral-backed protection. A holder can withdraw their remaining asset or surrender it for a backing payout, subject to the pool’s terms. Backing providers take the first loss and receive a share of realized gains.

The app is running on Monad testnet. We’ve exercised deposits, both holder exits and the backing-provider withdrawal flow, with transaction evidence in the repo. These are our own test transactions, not customer traction or real-money TVL.

YieldShield existed before Metropolis. We’re reusing that protocol foundation; the submission focuses on the new Monad app, integrations and deployment. We’ve documented the reused code and our use of Codex in HACKATHON_DELTA.md.

Next up: finish the full Dynamic wallet walkthrough and get people outside the team to try the product.

Attachments: [live app](https://monad.yieldshield.ai), [reuse disclosure](https://github.com/YieldShield/yieldshield-monad/blob/main/docs/HACKATHON_DELTA.md).

## Posted: asset expansion

A second milestone: the asset expansion is deployed.

We now have seven funded testnet pools, including WMON/AUSD and shMON/AUSD using Agora’s official test AUSD. We ran both new pools through deposits, asset exits, backing payouts and provider withdrawals, with 20 confirmed transactions recorded in the repo.

We also replaced the limited asset choices with searchable selectors and made the faucet the starting point for wallets that need test funds. The mainnet asset catalog includes things like syrupUSDC and sUSDe, but those are research entries, not live YieldShield markets.

The immediate focus is making the existing flows easier to use and faster to load. We’re adding Envio-backed activity history and a Chainlink CRE pool-health workflow; both are still in progress. We’ll share working evidence when they’re ready.

Attachment: [asset expansion release](https://github.com/YieldShield/yieldshield-monad/blob/main/docs/ASSET_EXPANSION_RELEASE.md).

## Evidence and next update

Both posts returned “Private update posted” and appeared under David Hawig in the project history. The project description was also saved with seven pools, current public source/product-guide links, truthful testnet scope and ongoing integration status.

Final submission opens 22 September; these posts do not submit the project.

## Posted: verified wallet and sponsor execution

We’ve now completed the browser wallet walkthrough through Dynamic and MetaMask: wrap MON, open protection, reload the page and withdraw. The wallet and position both recovered correctly after reload.

There’s also an optional Kuru funding step under Faucet. Our internal test bought MON with 10 Kuru test USDC and withdrew it to the same wallet. All five transactions and received amounts are recorded in the repo. These are test runs, not customer trading activity.

The Chainlink CRE workflow passed its official simulation against our live API and Monad testnet. Both AUSD pools and all three configured price feeds matched the onchain readings. It isn’t running as a continuous monitor yet.

The biggest open question is whether holders value the exit choices and backing providers accept the economics. We’ve prepared a plan to test it with six holders and four potential providers; those conversations haven’t happened yet. The demo and founder pitch are next too.

Envio history is implemented but awaiting its free API token. We’re keeping it hidden until configured.

Attachment: [public production and CRE evidence](https://github.com/YieldShield/yieldshield-monad/pull/32).

The third post returned “Private update posted” and appeared under David Hawig. The Mentors page then exposed the mentor list and a working question composer. Access was checked by opening and cancelling the empty composer; no mentor question was sent. The initial one-update/three-update wording discrepancy no longer blocks access.
