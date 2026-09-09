/** Additive crypto status. No signer, minting or mutable configuration. */
import assert from "node:assert/strict";
import { keccak256, parseAbi } from "viem";
import { createReader, readDemoMarket, readFaucetStatus } from "./generated/crypto-status-reader.mjs";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const verified = new WeakMap();
const position = {
  state: "position-required",
  blockers: [{ code: "position-required", message: "Check the position owner, waiting period and current payout." }],
};
const unknown = {
  state: "unknown",
  blockers: [{ code: "status-unknown", message: "Refresh this pool before continuing." }],
};
const abi = parseAbi([
  "function owner() view returns(address)",
  "function bootstrapModeEnabled() view returns(bool)",
  "function POOL_FACTORY() view returns(address)",
  "function cooldown() view returns(uint256)",
]);
export async function readCryptoExtensionStatus({ client, manifest: m, readStockStatus, now = Date.now }) {
  assert.equal(await client.getChainId(), 84532);
  assert.equal(m.deploymentKind, "base-sepolia-crypto-vault-extension-v1");
  assert.equal(m.status, "complete");
  assert.equal(m.pools.length, 9);
  assert.equal(m.assets.length, 9);
  const c = (n) => m.contracts[n].address;
  const timestamp = Math.floor(now() / 1000);
  const digest = keccak256(new TextEncoder().encode(JSON.stringify(m)));
  if (verified.get(client)?.digest !== digest || timestamp - verified.get(client).at > 600) {
    await Promise.all(
      Object.values(m.contracts).map(async (r) => {
        const [code, receipt] = await Promise.all([
          client.getCode({ address: r.address }),
          client.getTransactionReceipt({ hash: r.txHash }),
        ]);
        assert(code && same(keccak256(code), r.runtimeCodehash));
        assert(
          receipt.status === "success" && same(receipt.contractAddress, r.address) && same(receipt.from, m.deployer),
        );
      }),
    );
    verified.set(client, { digest, at: timestamp });
  }
  const deps = { factory: c("CryptoFactory"), compositeOracle: c("CryptoComposite") };
  const [pools, market, faucet, bootstrap, stockStatus] = await Promise.all([
    createReader(client, deps).loadPools(),
    readDemoMarket(client),
    readFaucetStatus(
      client,
      c("CryptoFaucet"),
      m.deployer,
      m.assets.map((a) => a.testToken),
    ),
    client.readContract({ address: deps.factory, abi, functionName: "bootstrapModeEnabled" }),
    readStockStatus(),
  ]);
  assert.equal(bootstrap, false);
  // Seeded pools are historical deployment evidence, not a cap on permissionless creation.
  // The reader authenticates every discovered proxy and its current pinned implementation.
  assert(m.pools.every((seed) => pools.some((pool) => same(seed.address, pool.address))));
  const tokens = faucet.tokens.map((t) => {
    const a = m.assets.find((a) => same(a.testToken, t.address));
    assert(a);
    return {
      symbol: a.symbol,
      sourceSymbol: a.sourceSymbol,
      decimals: a.decimals,
      address: t.address,
      enabled: t.enabled,
      funded: t.funded,
      ready: t.enabled && t.funded,
      dripAmountBaseUnits: String(t.dripAmount),
      balanceBaseUnits: String(t.faucetBalance),
    };
  });
  const assets = pools.map((p) => {
    const expected = m.pools.find((x) => same(x.address, p.address));
    if (expected)
      assert(same(expected.shieldedToken, p.shielded.token) && same(expected.backingToken, p.backing.token));
    assert(
      m.assets.some((x) => same(x.testToken, p.backing.token) && (x.symbol === "TestUSDC" || x.symbol === "vUSDC")),
    );
    const a = m.assets.find((a) => same(a.testToken, p.shielded.token));
    const price = market.assets.find((a) => same(a.token, p.shielded.token));
    assert(a && price);
    const ready = p.stats.active && !p.oracle.paused;
    const availability = p.availability;
    return {
      symbol: p.shielded.symbol,
      sourceSymbol: a.sourceSymbol,
      name: p.shielded.name,
      decimals: p.shielded.decimals,
      sourcePrice: null,
      relay: null,
      executionPrice: {
        kind: a.category === "vault" ? "test-vault-nav" : "deterministic-demo",
        priceUsd: Number(price.priceUsd8) / 1e8,
        evaluatedAt: market.evaluatedAt,
        marketObservation: false,
      },
      pool: {
        address: p.address,
        state: ready ? "ready" : "unknown",
        terms: {
          backingSymbol: p.backing.symbol,
          commissionBps: Number(p.stats.premiumRateBp),
          poolFeeBps: Number(p.stats.poolFeeBp),
          protocolFeeBps: Number(p.stats.protocolFeeBp),
          collateralRatioBps: Number(p.stats.collateralRatioBp),
          protectedExitDelaySeconds: Number(p.stats.minimumPoolTime),
          collateralUnlockSeconds: Number(p.stats.unlockDuration),
        },
        capacity:
          availability?.maxShieldedDeposit !== null && availability?.maxShieldedDeposit !== undefined
            ? {
                maxDepositBaseUnits: String(availability.maxShieldedDeposit),
                minDepositBaseUnits: String(p.stats.shieldedMinDeposit),
                requiresSimulation: true,
              }
            : null,
      },
      actions: {
        openPosition: availability?.openPosition ?? unknown,
        provideCollateral: availability?.provideCollateral ?? unknown,
        withdrawStock: ready ? position : unknown,
        protectedExit: ready ? position : unknown,
        withdrawCollateral: ready ? position : unknown,
      },
    };
  });
  const allAssets = [...stockStatus.assets, ...assets];
  const poolsReady = allAssets.filter((a) => a.pool.state === "ready").length;
  const evaluatedAt = Math.floor(now() / 1000),
    validUntil = Math.min(
      stockStatus.validUntil,
      market.validUntil,
      faucet.validUntil,
      ...pools.map((p) => Number(p.availability.validUntil)),
    );
  assert(evaluatedAt < validUntil);
  return {
    ...stockStatus,
    evaluatedAt,
    validUntil,
    deployment: {
      ...stockStatus.deployment,
      verified: stockStatus.deployment.verified && true,
      contractsConfirmed: stockStatus.deployment.contractsConfirmed + Object.keys(m.contracts).length,
      transactionsConfirmed: stockStatus.deployment.transactionsConfirmed + Object.keys(m.transactions).length,
      totalPools: allAssets.length,
      poolsReady,
      faucetReady: tokens.some((t) => t.ready),
      steps: [
        { code: "infrastructure", complete: true, label: "Verify stock, crypto and vault contracts" },
        { code: "pools", complete: poolsReady === allAssets.length, label: "Verify registered pools" },
        { code: "faucet", complete: tokens.some((t) => t.ready), label: "Fund the asset basket" },
        { code: "exchange", complete: market.ready, label: "Verify multi-asset trading" },
      ],
    },
    faucet: {
      verified: true,
      address: c("CryptoFaucet"),
      configured: faucet.configured,
      ready: tokens.some((t) => t.ready),
      cooldownSeconds: 86400,
      tokens,
    },
    exchange: { verified: market.ready, address: market.exchange, ready: market.ready },
    assets: allAssets,
  };
}
