# Asset expansion release — 16 September 2026

## Published website update

The AUSD release is live at https://monad.yieldshield.ai. The frontend is Vercel deployment `dpl_UJURiYuNPg4WFzNFcJQWxDJGCis5` (code `84c0fa7`); the API is Railway deployment `3b977f83-eb55-4afc-8b33-13c81de781f2` (code `d4994c4`). The repository remains private. [Public release evidence](evidence/expanded-release.json) records the healthy assets, markets and creation quote.

- Searchable protected-asset and backing dropdowns, with WMON, shMON and the isolated sMON-demo scenario.
- Live, upward-rounded creation bonds; factory-specific routing; review revalidation after approval; exact PoolCreated receipt links.
- Seven mainnet catalog entries: syrupUSDC, sUSDe, USDe, earnAUSD, Kintsu sMON, wstETH and weETH. They are not testnet transaction options.
- Version-aware pool verification and issuer implementation pins. The verified registry adds AUSD to Create pool, Protect, Provide and the official Agora faucet flow.

## Deployed and verified

The new immutable policy, initializer, pool router, factory and composite oracle are deployed. Bootstrap is finalized and ownership/governance point to the existing timelock. The official Agora faucet supplied 10,000 test AUSD. Both WMON/AUSD and shMON/AUSD pools were created with 500-AUSD bonds and seeded with 2,000 AUSD each.

The initial 3-test-MON cap stopped before signing the first pool creation. The owner's additional 5 test MON brought the balance to 5.679524038; the reviewed cumulative deployment cap was raised to 6 MON. All 20 previously confirmed intents remain unchanged. The separate expanded journey retained a 3-MON cap and completed both pools' holder and provider paths on the public testnet.

- Factory: `0xFd2Bd5adF1776c6da4eF6accCc49C1621aCE1410`
- Router: `0x1a8f5EC844dd9b21659A8d1C3628d2C6cBA55f27`
- Asset policy: `0x49535Db43F42C29691Bdc2CFA813B163d0DA01c7`
- WMON/AUSD: `0x89Dc1d055Ac9ec50E1FA0a2d7da8be858F1B1470`
- shMON/AUSD: `0x18F7E79744b08a302E786c0D62b8c1cfB3CFc475`
- [Complete code, receipt and governance verification](evidence/deployment-verification.json)
- [Public-network holder/provider evidence](evidence/expanded-journey.json)
- [Resumable journal](../contracts/deployments/monad-expansion-v2.json)

## Verification

- 78 frontend tests and 72 API/deployment-tool tests pass; production build passes.
- [GitHub release checks](https://github.com/YieldShield/yieldshield-monad/actions/runs/35067802489) passed for application commit `84c0fa7`, including the Monad and imported immutable-module contract regressions.
- 32 local Monad contract tests passed before adding opt-in fork cases.
- Fork: issuer faucet claim and exact transfer accounting; canonical wrapper wrap/unwrap; new factory creates and funds an AUSD pool, accepts a protected deposit and returns the asset on exit. The fork uses actual issuer balances/faucet state and existing deployed factory code, not a substitute AUSD token.
- Four issuer/pair fork cases passed against block 62962770, including shMON/vTestUSDC on the existing reference factory and shMON/AUSD on the new factory. Both pairs pass asset exits, backing exits and provider withdrawals after the configured delays.
- Canonical WMON registration is rejected by the existing static-probe implementation; it is intentionally not whitelisted. The regression uses the pre-finalization block 62958251.
- Browser: search, keyboard selection, vault-share bond conversion, unsupported deep-link rejection, phone-width dropdown fit and token image loading checked against the local API.
- Production: all seven markets and six assets report healthy; all three factory versions return usable creation quotes, including 500 AUSD for the expanded factory. The signed-out browser verifies all three backing choices, the AUSD faucet section, WMON/AUSD protection, shMON/AUSD liquidity and the investment menu. The pool receipt-address route also resolves a named registry pool correctly after the separately committed regression fix. Images load without horizontal overflow.

The live expanded journey confirms deposits, asset exits, AUSD backing exits, provider fee claims, withdrawal notices and provider withdrawals for both pools. Recipient balance changes are recorded at the actual receipt blocks. Forty-four declared contracts and all seven pools pass full runtime and wiring verification. Receipt NFTs use the exact original artifacts because every factory reuses the original PoolCreationLib.

The dedicated wallet retained 2.264779258 test MON after completion. Browser checks here were signed out; the recorded signed journeys used the dedicated deployment account. A cold public status read took approximately 14 seconds; this verifies readiness, not a latency guarantee.

WETH, Circle USDC and mainnet yield shares retain the gates in [the research](YIELD_ASSET_RESEARCH.md). Existing pools and their historical deployment records remain unchanged.
