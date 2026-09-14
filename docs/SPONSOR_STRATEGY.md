# Metropolis sponsor strategy

Initial review: 9 September 2026. Public catalog and signed-in Dynamic, Kuru, Agora and CRE bounty details rechecked: 14 September 2026. This is the sponsor selection and evidence plan for YieldShield on Monad, following the owner's request to consider sponsors throughout the build. It supplements the implementation plan; it does not claim that any bounty has been earned or any new integration is live.

## Decisions

1. **Prioritize Dynamic for onboarding.** A new user should be able to create or connect a wallet and complete the protection journey. This improves the consumer product and aligns with a published bounty.
2. **Investigate executable Kuru trading next.** Acquiring an asset through Kuru and then protecting it is a coherent product journey. The current external Kuru link does not qualify as an integration.
3. **Defer Agora's mobile trading bounty for this release.** The signed-in requirements mandate Mera authentication, an AUSD balance and a Perpl trade together. That is a separate product path from the planned Dynamic/Kuru flow; adding AUSD or a responsive layout alone would not qualify.
4. **Evaluate Chainlink CRE for a useful pool-health workflow.** Keep oracle selection separate from this bounty: replacing Pyth with a Chainlink price feed alone does not demonstrate CRE.
5. Use relevant RPC, simulation and indexing resources when they solve a measured need. Keep cash awards, credits and winner benefits separate.

The core release now has five funded pools, fresh RedStone MON pricing and completed holder/provider transaction journeys. Sponsor work must strengthen that release. Each implemented sponsor feature gets its own commit, tests appropriate to its behavior, deployment record and demo evidence.

## Why Pyth and Dynamic are separate decisions

Dynamic provides wallet and authentication infrastructure; it cannot replace a contract's MON/USD source. The active reference factory now uses RedStone's official Monad testnet MON feed, with 120-second freshness and conservative shMON NAV. Its runtime and live rounds were verified directly. Pyth remains an attributed historical adapter: its free trial excludes MON/USD and ongoing API access would require a paid plan, which was not selected. [Official RedStone feed](https://app.redstone.finance/push-feeds/MON/monadTestnetBoltMultiFeed).

Chainlink's current address directory has no enabled Monad testnet tab. That prevents claiming a verified Chainlink testnet price-feed integration. Chainlink CRE remains a separate potential sponsor workflow; RedStone is not claimed as a Metropolis bounty sponsor.

Dynamic React SDK 5.8.0 is now integrated in an isolated YieldShield Monad sandbox environment, with email authentication, embedded wallets, explicit signing confirmations and Monad account/network checks. The production sign-in UI is being verified; a completed user signing journey must be recorded before a bounty-ready claim. The SDK is loaded on demand. No developer signing key or paid subscription was provisioned.

## Verified public shortlist

The following amounts and bounty names were read from the official [Metropolis landing page](https://monad.xyz/developers/hackathons/metropolis). These are advertised awards, not a forecast of winnings. The four portal pages reviewed below each describe a single prize. Requirements for other bounties, prize stacking and any unstated network constraints remain to be checked.

## Signed-in requirements confirmed on 14 September

| Bounty                                                                                                                            | Required work and evidence                                                                                                                                                                                                             | Decision                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Dynamic](https://hackathon.monad.xyz/tracks/best-use-of-dynamic) — $5,000                                                        | A deployed, usable app incorporating its SDK for authentication, wallets or signing, within one of the four tracks. Judges assess integration quality, practical utility and creativity; deeper use of multiple primitives is a bonus. | First integration candidate. Existing contracts or a wallet-provider link do not establish qualification. |
| [Kuru consumer trading](https://hackathon.monad.xyz/tracks/build-the-next-consumer-trading-app-on-kuru) — $5,000                  | Working order-book integration, defined target users, evidence of demand through usage/trading, acquisition and retention strategy, and a continuation plan. The portal links its testnet documentation and faucet.                    | Second candidate. User research and actual trades are additional deliverables, not just API wiring.       |
| [Agora mobile trading](https://hackathon.monad.xyz/tracks/best-mobile-trading-app-on-monad-agora-onchain-trading-bount) — $10,000 | Mobile app with Mera passkey login, a held/displayed AUSD balance and at least one Perpl trade in the demo.                                                                                                                            | Defer; all three integrations are mandatory, and mobile-web acceptance is not specified.                  |
| [Chainlink CRE](https://hackathon.monad.xyz/tracks/best-workflow-with-cre) — $3,000                                               | Meaningful CRE orchestration connecting at least one blockchain with an external API/system/data source/agent. A successful CRE CLI simulation or live CRE network deployment is accepted.                                             | A capacity/oracle-health workflow may fit. Reading a Chainlink price feed alone does not.                 |

The portal remains on the Onchain Finance & Trading primary track. No sponsor bounty has been added or represented as completed. Dynamic dashboard access and a project environment are still needed. General submission opens 22 September; the current Submission tab conceals its fields until then.

| Priority            | Sponsor and advertised bounty                                   | Product contribution                                                                                                    | Current gap / evidence needed                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First               | Dynamic — $5,000, Best Use of Dynamic                           | Email or passkey onboarding, embedded wallet and existing-wallet connection, leading into a complete protection journey | No Dynamic environment is configured in the Monad app. Verify exact bounty terms; configure the SDK environment; record real onboarding, signing, logout/reconnect and recovery.                  |
| Next                | Kuru — $5,000, consumer trading app                             | Quote, buy MON exposure, then open protection with the acquired asset                                                   | Current integration is an external link. Establish target-network route support, credentials and liquidity; verify minimum output, spender, destination, recipient and confirmed balance changes. |
| Deferred            | Agora — $10,000, mobile trading app                             | Mera login, AUSD balance and Perpl trading                                                                              | These three integrations are mandatory. Mobile-web acceptance remains unspecified; the current Dynamic/Kuru plan does not satisfy this bounty.                                                    |
| Conditional         | Chainlink — $3,000, CRE workflow                                | Scheduled or event-driven report of pool capacity, collateral conditions and reference-price freshness                  | Needs an actual CRE workflow, supported network, runtime access and reproducible execution evidence. A normal backend task or a price-feed read alone does not demonstrate CRE.                   |
| Supporting          | Envio — $1,000, best use                                        | Index pool and receipt events for position history and capacity views                                                   | The current API reads RPC directly. Integrate only if it improves history or load; test replay, partial-exit receipt replacement, lag, reorgs and source attribution.                             |
| Later investigation | Perpl — $3,000, analytics/risk tool; separate $5,000 API bounty | Risk context tied to a real Perpl integration                                                                           | Current YieldShield pools have no Perpl exposure. Do not imply a generic protection dashboard qualifies; read product-specific requirements first.                                                |
| Later investigation | Nansen AI — $5,000, best use                                    | Verified market context that helps users understand an asset or liquidity conditions                                    | Confirm Monad data coverage, API access and terms. Never substitute an analytics score for the contract's settlement oracle.                                                                      |

The two Kuru bounties are distinct. The second $5,000 opportunity is for new assets and markets; the first consumer trading bounty is the clearer fit. Similarly, Agora's second $10,000 bounty concerns cross-border payments, which is outside this product's current scope. Neither pair should be added together as expected winnings.

## Dynamic implementation steps

1. **Confirm the bounty and provision the environment.** Record its exact eligibility and demonstration requirements. Use a project environment owned by YieldShield/Hawig Ventures, with the actual production origin and a separate development setup. Check Monad testnet, external wallets, chosen login methods, embedded wallet availability and any usage limits. The existing parent YieldShield app has optional legacy Dynamic integration, but its local environment ID is empty; that does not establish a configured Monad integration.
2. **Select the supported SDK path.** Dynamic now recommends its JavaScript SDK with React hooks for new integrations. Evaluate that against the existing React 18/Vite/viem app. Its current JavaScript SDK is headless, so budget for complete authentication, device registration, step-up authentication and error flows. Do not mix current JavaScript SDK calls with the older React connector API. [Current React quickstart](https://www.dynamic.xyz/docs/javascript/reference/react-quickstart).
3. **Integrate wallet identity with the existing transaction checks.** Preserve chain 10143, account checks before signing, verified targets and spenders, exact allowances, simulation, gas reserve and pending-receipt recovery. Clear account-scoped position data when switching identities. An email login is not evidence that an embedded wallet has been created or that a transaction can be signed.
4. **Make the full journey usable.** Support the selected embedded-wallet login and external wallets, rejection, cancellation, reconnect, expiry and logout. Give users a documented recovery/export route. The Railway API remains read-only and receives no wallet private key. Update the app's privacy disclosure to reflect Dynamic before enabling it.
5. **Verify before claiming the bounty.** Test a fresh user and a returning user, a phone-width layout and an actual supported mobile wallet/browser, wrong-chain handling, account switching, rejected approvals, insufficient gas and receipt recovery. Capture at least one confirmed Monad action following Dynamic onboarding, then the full protection and exit journey once pools are funded.

The Dynamic environment identifier is public configuration; administrative API tokens and user sessions are credentials. Do not add an administrative token to the frontend or record session tokens in evidence. Live onboarding needs a configured environment and working origin/network settings, not just an installed package. [Dynamic authentication practices](https://www.dynamic.xyz/docs/overview/authentication/best-practices).

## Kuru and Agora implementation gates

Kuru Flow exposes the routing engine for Monad markets. Its general documentation does not prove that a particular testnet pair can execute. Establish the supported chain and pair before implementing an approval or swap. Record quote provenance, expiry, decoded call parameters and actual output. Purchasing an asset and protecting it are separate operations unless an explicitly reviewed atomic path is built; the UI must say when protection has not yet been opened. [Kuru Flow](https://docs.kuru.io/kuru-flow/flow-overview).

Agora currently lists Monad testnet AUSD at `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` and faucet `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`. These are documentation candidates, not deployment verification performed by this sponsor review. Check current bytecode, token identity, access/funding, transfer restrictions and an appropriate valuation policy before adding an AUSD-backed pool. Keep TestUSDC explicitly separate. [Agora deployments](https://docs.agora.finance/developer/contract-deployments).

If either bounty requires mainnet execution, record that dependency and request a concrete mainnet scope and funding decision before enabling real-money actions. Do not silently move the current testnet product to mainnet for a prize.

## CRE implementation gate

A possible useful workflow reads verified pool state and oracle timestamps, computes a bounded health report and publishes the report with its observation block and time for the UI. Establish how reports are authenticated and how stale or missing reports are displayed. It must not silently gain withdrawal authority or replace settlement rules. Chainlink documents separate simulation and production workflow paths; demonstrate the level actually achieved and confirm which the bounty accepts. [CRE documentation](https://docs.chain.link/cre).

Do not add this workflow merely to display a sponsor logo. First determine whether it improves a user's ability to understand available protection, and whether supported execution and evidence can be completed within the build window.

## Wider sponsor watchlist

| Sponsor                 | Published opportunity                                 | Treatment                                                                                                                    |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Privy                   | $5,000 bounty                                         | Alternative wallet provider; prioritize Dynamic rather than adding duplicate onboarding systems. Exact requirements pending. |
| Aurora Intents          | $5,000 for bringing liquidity to Monad                | Later funding journey; assess supported assets and networks only after the Monad core works.                                 |
| Monad Foundation / Mera | Two $2,500 bounties for Mera UX and passkey/key usage | Compare with Dynamic's onboarding requirements before introducing a second wallet architecture.                              |
| MetaMask                | $2,500 agent wallet plugin bounty                     | No agent wallet is currently part of the product. Ordinary MetaMask connection does not demonstrate a plugin.                |
| Cleanverse              | $2,000 CVI/CVA integration bounty                     | No established product fit yet.                                                                                              |
| Monad Foundation        | $5,000 community team project bounty                  | Confirm affiliation and team requirements; do not invent community membership.                                               |
| Alchemy                 | $1,000 in credits                                     | Evaluate RPC/tooling fit and eligibility; credits are not cash.                                                              |
| Tencent / Kepler Plan   | $2,000 in credits for Hunyuan                         | No current AI-model requirement.                                                                                             |
| Kimi                    | $3,000 in credits                                     | No current AI-model requirement.                                                                                             |
| Alibaba Cloud           | $5,000 in credits for Qwen 3.8 Max                    | No current AI-model requirement.                                                                                             |

General participant resources listed on the same page: Quicknode Build for three months, Tenderly Pro access, Zerion API Builder for one month, Dwellir Developer for three months, and Spectrum Nodes Business for two months. Verify activation and expiry before relying on any perk in a deployed service.

Separately, the page lists benefits for winning teams: ack3 security scans ($15,000 advertised value), Chainstack plans ($10,000), Crouton Digital RPC ($10,000), Mercuryo product credits and integration support ($10,000), Zerion API ($6,000), Envio Cloud hosting ($5,000), and Spectrum Nodes plans ($3,000). Spectrum's winner card specifies one Business month per track winner and Enterprise for the champion; it does not specify the Enterprise duration. These are described as services, plans or credits; do not count those advertised values as cash integration bounties or an independent security audit already received. Mercuryo's card does not specify a per-team allocation, redemption process or expiry.

## Monitoring observations

**10 September:** the 21 public bounty/credit entries, four participant resources, five winner benefits and published dates matched the initial review. The portal still required sign-in; this previously reported blocker was not alerted again.

**11 September — new Spectrum Nodes benefits:** the official [Metropolis page](https://monad.xyz/developers/hackathons/metropolis) added two months of Business access for every team and the separately advertised $3,000 winner-plan package described above. These are infrastructure benefits, not a new cash integration bounty. Spectrum's [pricing/catalog page](https://spectrumnodes.com/pricing) lists Monad mainnet and testnet. This makes it a candidate for an additional RPC endpoint during demo testing, after confirming the redemption process, exact chain 10143 access, relevant method limits, expiry and overage terms. No account, subscription or endpoint was provisioned during monitoring.

**12–13 September:** the public catalog, dates and checked sponsor documentation matched the 11 September observation. The unchanged portal sign-in requirement was not alerted again.

**14 September — new Mercuryo winner benefit:** the official [Metropolis page](https://monad.xyz/developers/hackathons/metropolis) added a $10,000 advertised package of product credits and integration support for winning teams. This brings the winner-benefit list to seven entries; it is not a new cash integration bounty or a general participant resource. Allocation, activation, expiry and detailed eligibility remain unspecified on the public card.

Mercuryo's [on-ramp guide](https://widget.docs.mercuryo.io/guide/flows/on-ramp) describes card/Apple Pay/Google Pay purchases delivered to a user's wallet, with transaction tracking and currency/network availability checks by country. Product implication: consider a future wallet-funding step after Dynamic onboarding, before trading and protection, if MON on the intended network and the user's country are supported. Current target-network availability, merchant access and the benefit's terms still need verification; do not treat this as a source of testnet MON or add paid funding to the current testnet demo. Keep it on the later funding watchlist rather than changing the Dynamic/Kuru priorities. No account, purchase or integration was activated during this check.

The morning monitoring check on 14 September found the 21 public bounty/credit entries, five participant resources and 13 October submission date unchanged. Later that day, the owner authorized continued implementation and submission preparation. Google sign-in with the YieldShield account restored portal access; the exact requirements above were read, and Agora was deferred because Mera and Perpl are mandatory. Application and testnet deployment work resumed separately from the read-only monitoring task.

## Evidence and ongoing review

Before selecting or claiming a bounty, record:

- The current portal terms and source URL, review date, deadline/timezone and any update date.
- Mandatory sponsor products, supported network, mobile/native requirements and whether a test deployment or simulation is accepted.
- Team/new-work/source-license requirements, bounty stacking rules and any required registration.
- The qualifying code paths and separate commits, actual environment/deployment identity, transaction or execution receipts, and demo timestamps.
- Outstanding dependencies and an honest status: investigated, implemented, configured, exercised or submission-ready.

The signed-in portal was restored on 14 September. Dynamic, Kuru, Agora and CRE terms are verified above. The owner explicitly instructed that the repository remain private; resolve the source-rule discrepancy before final submission.

Sponsor monitoring is scheduled daily at 09:00 Europe/Berlin through the submission deadline. Alert only on meaningful changes, newly relevant opportunities or an actionable verification failure; do not repeatedly report an unchanged sign-in blocker. Also review this document before selecting a new integration and before final submission. Monitoring does not authorize sponsor outreach, account creation, subscriptions or submission.
