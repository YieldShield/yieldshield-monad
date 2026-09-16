# Asset expansion release — 16 September 2026

## Published website update

The update is live at https://monad.yieldshield.ai/create-pool. The frontend is Vercel deployment `dpl_AQ6prjEh8kqZYhL4VdnLVx6rSE6P`; the API is Railway deployment `2da4a6b4-2b0b-4967-b327-472f134af626`. The implementation is pushed to the private repository's `main` branch.

- Searchable protected-asset and backing dropdowns, with WMON, shMON and the isolated sMON-demo scenario.
- Live, upward-rounded creation bonds; factory-specific routing; review revalidation after approval; exact PoolCreated receipt links.
- Seven mainnet catalog entries: syrupUSDC, sUSDe, USDe, earnAUSD, Kintsu sMON, wstETH and weETH. They are not testnet transaction options.
- Version-aware pool verification and issuer implementation pins. AUSD faucet integration stays gated until its asset registry is activated.

## Deployed, activation pending

The new immutable policy, initializer, pool router, factory and composite oracle are deployed. Bootstrap is finalized and ownership/governance point to the existing timelock. The official Agora faucet supplied 10,000 test AUSD; a 500-AUSD allowance is approved for the new factory. No AUSD pool has been created on the public network yet.

The initial 3-test-MON deployment cap stopped **before signing** the first pool creation. The dedicated account had 0.679524038 test MON at the latest check. Five additional test MON have been requested for pool creation, seeding and live withdrawal evidence. Resume only after checking the balance, recording an appropriate revised cumulative cap and keeping every existing intent unchanged.

- Factory: `0xFd2Bd5adF1776c6da4eF6accCc49C1621aCE1410`
- Router: `0x1a8f5EC844dd9b21659A8d1C3628d2C6cBA55f27`
- Asset policy: `0x49535Db43F42C29691Bdc2CFA813B163d0DA01c7`
- [Exact code, receipt and governance verification](evidence/expansion-contract-verification.json)
- [Resumable journal](../contracts/deployments/monad-expansion-v2.json)

## Verification

- 77 frontend tests and 72 API/deployment-tool tests pass; production build passes.
- 32 local Monad contract tests passed before adding opt-in fork cases.
- Fork: issuer faucet claim and exact transfer accounting; canonical wrapper wrap/unwrap; new factory creates and funds an AUSD pool, accepts a protected deposit and returns the asset on exit. The fork uses actual issuer balances/faucet state and existing deployed factory code, not a substitute AUSD token.
- Four issuer/pair fork cases passed against block 62962770, including shMON/vTestUSDC on the existing reference factory and shMON/AUSD on the new factory. Both pairs pass asset exits, backing exits and provider withdrawals after the configured delays.
- Canonical WMON registration is rejected by the existing static-probe implementation; it is intentionally not whitelisted. The regression uses the pre-finalization block 62958251.
- Browser: search, keyboard selection, vault-share bond conversion, unsupported deep-link rejection, phone-width dropdown fit and token image loading checked against the local API.
- Production: the API health, status, creation and market endpoints return HTTP 200; both existing factory versions return usable creation quotes and all five existing markets remain listed. Browser search selects shMON and vTestUSDC, with the live bond displayed as 499.999001 vault shares. The seven mainnet catalog images load without horizontal overflow.

A successful fork is not a public transaction receipt. Live AUSD holder/provider withdrawal evidence and website activation remain pending. WETH, Circle USDC and mainnet yield shares retain the gates in [the research](YIELD_ASSET_RESEARCH.md). Existing pools and their historical deployment records remain unchanged.
