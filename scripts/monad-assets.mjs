/** Build the chain/address registry from actual deployment records; never fabricate pool addresses. */
export function deploymentAssets(manifest, config) {
  const c = (name) => manifest.contracts[name]?.address;
  const usd = c("TestUSDC"),
    lab = c("ScenarioMON"),
    wmon = c("WMON"),
    vault = c("TestUSDVault"),
    scenario = c("ScenarioOracle"),
    backingFeed = c("VaultBackingFeed"),
    reference = c("ReferenceFeed");
  if (![usd, lab, wmon, vault, scenario, backingFeed, reference].every(Boolean)) return [];
  const assets = [
    {
      id: "test-usd",
      address: usd,
      symbol: "TestUSDC",
      name: "Test USD",
      decimals: 6,
      kind: "synthetic-unit",
      feed: scenario,
      artifact: "MonadTestToken",
    },
    {
      id: "scenario-mon",
      address: lab,
      symbol: "sMON-demo",
      name: "Scenario MON",
      decimals: 18,
      kind: "synthetic",
      feed: scenario,
      artifact: "MonadTestToken",
    },
    {
      id: "test-usd-vault",
      address: vault,
      symbol: "vTestUSDC",
      name: "Test USD Vault",
      decimals: 6,
      kind: "test-vault-nav",
      feed: backingFeed,
      artifact: "MonadYieldVault",
    },
  ];
  return assets.concat([
    {
      id: "wmon",
      address: wmon,
      symbol: "WMON",
      name: "Wrapped testnet MON",
      decimals: 18,
      kind: "external-reference",
      feed: reference,
      artifact: "MonadWrappedNative",
    },
    {
      id: "shmon",
      address: config.externalTokens.shMON,
      symbol: "shMON",
      name: "Staked testnet MON",
      decimals: 18,
      kind: "redemption-nav",
      feed: reference,
      external: true,
    },
  ]);
}
