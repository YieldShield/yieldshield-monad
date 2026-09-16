/** Immutable deployment versions. Asset IDs resolve only against this chain's verified registry. */
export function factoryVersions(registry) {
  return [
    {
      id: "scenario-v1",
      contract: "Factory",
      router: "BasePoolRouter",
      environment: "scenario",
      protectedAssets: ["scenario-mon"],
      backingAssets: ["test-usd", "test-usd-vault"],
    },
    {
      id: "reference-v1",
      contract: "ReferenceFactory",
      router: "BasePoolRouter",
      environment: "reference",
      protectedAssets: ["wmon", "shmon"],
      backingAssets: ["test-usd", "test-usd-vault"],
    },
    ...(registry.expandedFactories || []),
  ].filter((v) => registry.contracts[v.contract] && registry.contracts[v.router]);
}
