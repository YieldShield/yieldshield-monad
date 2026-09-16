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

The next update should report actual sponsor execution and deployed behavior after verification, including any remaining gaps. Do not invent customer interviews, partnerships or adoption to fill it. Final submission opens 22 September; these posts do not submit the project.
