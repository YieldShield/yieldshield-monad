# Architecture and asset decisions

## Runtime boundaries

```mermaid
flowchart LR
  UI[Monad React app on Vercel] --> API[Read-only Railway API]
  API --> RPC[Monad testnet RPC]
  API --> Pyth[Authenticated signed Pyth data]
  UI --> Wallet[User wallet: simulate and sign]
  Wallet --> Chain[Monad contracts, chain 10143]
  Chain --> Ref[Reference factory: WMON and shMON]
  Chain --> Lab[Scenario factory: sMON-demo]
```

The API observes contracts and returns bounded public data. It never signs for users. The wallet verifies network/account, target code and factory provenance, obtains exact token allowances when needed, simulates, estimates gas and waits for two confirmations. A transaction hash survives a browser reload so a pending action is not casually sent twice. Final execution can still revert if price, capacity or state changes; the contract is authoritative.

The scenario and reference factories have separate CompositeOracle deployments and token registries. Controlled scenario prices cannot value WMON or shMON. The test vault's underlying is a fixed synthetic dollar unit, even where its shares back externally priced WMON.

## Assets selected after actual RPC checks

| Item | Decision and evidence |
| --- | --- |
| WMON | The older circulated testnet address `0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701` returned no code. Deploy an explicit YieldShield wrapper instead; deposit/withdraw maps one native testnet MON to one WMON. |
| TestUSDC | Use an independently named six-decimal test asset. Circle testnet USDC exists, but its faucet was not provisioned for this application. No Circle integration is claimed. |
| shMON | Use the official testnet address `0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9`; bytecode, symbol, decimals and conversion methods were read. Native deposit uses shMonad's payable deposit interface. |
| Pyth | Use `0x2880aB155794e7179c9eE2e38200202908C17B43` and MON/USD ID `0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1`. On-chain price was stale during setup. Current signed updates require authenticated Hermes access. |
| vTestUSDC | Own test vault accounts actual deposits and deliberately funded test yield, limits each contribution and total NAV growth, and ignores unsolicited transfers when computing NAV. It does not represent Morpho or an external lending strategy. |
| sMON-demo | Separate fixed-supply test asset with an 8-minute deterministic baseline/+25%/baseline/−25% cycle. Not Kintsu sMON. |

The Pyth adapter requires a positive price, exponent within −18…0, age ≤120 seconds, confidence ≤1%, and spot/EMA divergence ≤20%. shMON uses the lower of `convertToAssets` and `previewUnstake`, multiplied by the MON reference. It caps upward changes against its deployment reference rate while admitting declines. This is a valuation policy, not protection against every staking or market risk.

Signed update payloads are checked for exact feed identity, time, encoding and bounds before they are offered to a wallet. The Pyth contract validates the signed data, and the reference feed then applies its own checks. The API credential is confined to the server/deployment environment.

Backing-share payout uses current redeemable NAV as its denominator with conservative rounding, then applies the original native-share cap. A cap-denominator shortcut would overpay when share value rises and is deliberately avoided.

## Preserved protocol behavior

The imported immutable pool/factory modules preserve the original storage layout. Monad's initialization adapter delegates to the pinned original initializer and overrides only the two demonstration timing slots for the pinned asset combinations on testnet. Factory bootstrap is finalized. Governance uses the imported governor and a 48-hour timelock; the API is not an administrator.

An asset exit needs a usable protected-asset fee price. A backing exit additionally needs strict backing valuation and the protected-exit delay. Junior notice is a maturity timestamp, with an inclusive seven-day withdrawal window. Available backing is still constrained by active protection. Partial senior withdrawal settles fees on the entire position, burns the old receipt, and creates a proportionally reduced receipt that retains its original deposit time.

## Scope decisions

Sponsor selection now follows [the sponsor strategy](SPONSOR_STRATEGY.md). Dynamic is the prioritized wallet/onboarding integration; it serves a different role from Pyth pricing. Kuru execution, an Agora/AUSD mobile journey and a useful Chainlink CRE workflow have explicit feasibility and evidence gates. Those are planned changes, not claims about the current runtime below.

The active UI uses a new workspace rather than modifying the imported historical UI in place. Shared economics and contracts remain attributed. Test trading uses the existing inventory-funded mechanism adapted for the isolated Monad scenario. Kuru is an external discovery link only. No executable Kuru integration, AUSD bounty, tokenized stocks, Morpho strategy, mainnet funded market or AI trading agent is claimed.

## Official references

- [Monad network information](https://docs.monad.xyz/developer-essentials/network-information)
- [Monad oracle directory](https://docs.monad.xyz/tooling-and-infra/oracles)
- [Monad brand kit](https://www.monad.xyz/brand-and-media-kit)
- [Pyth migration requirements](https://docs.pyth.network/price-feeds/core/upgrade/preparing)
- [shMonad addresses](https://docs.shmonad.xyz/addresses/)
- [shMonad exchange-rate mechanics](https://docs.shmonad.xyz/exchange-rate)
- [Circle Monad deployment information](https://www.circle.com/blog/now-available-usdc-cctp-wallets-and-contracts-on-monad)

Documentation references were investigated on 9 September 2026. Recorded RPC results and deployment manifests take precedence over an unverified address copied from a web page.
