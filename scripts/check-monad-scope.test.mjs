import assert from "node:assert/strict";
import test from "node:test";
import { checkMonadScope, manifestPaths } from "./check-monad-scope.mjs";

function fixture() {
  const manifests = Object.fromEntries(manifestPaths.map((file) => [file, { dependencies: {} }]));
  manifests["package.json"].workspaces = ["apps/monad-web"];
  const lock = { packages: {
    "": { workspaces: ["apps/monad-web"] }, "apps/monad-web": {},
    "node_modules/monad-web": { link: true, resolved: "apps/monad-web" },
    "node_modules/@dynamic-labs/solana-core": { version: "5.8.1" },
    "node_modules/@solana/web3.js": { version: "1.98.4" },
  } };
  return { manifests, lock };
}

test("allows Dynamic's transitive Solana packages and the shared Base contracts", () => {
  const { manifests, lock } = fixture();
  checkMonadScope(manifests, lock, ["apps/monad-web/src/DynamicWallet.tsx", "services/monad/server.mjs",
    "contracts/contracts/base-modules/BasePoolViewsModule.sol", "scripts/generate-base-modules.mjs"]);
});
test("rejects direct and aliased Solana dependencies in every first-party manifest", () => {
  for (const file of manifestPaths) {
    for (const [name, version] of [["@solana/kit", "^6.10.0"], ["@solana-program/token", "*"],
      ["@yieldshield/sdk", "*"], ["@codama/renderers-js", "*"], ["legacy", "npm:@solana/kit@6.10.0"]]) {
      const { manifests, lock } = fixture(); manifests[file].dependencies[name] = version;
      assert.throws(() => checkMonadScope(manifests, lock, []), /direct Solana/);
    }
  }
});
test("rejects wildcard workspaces and unreviewed manifests", () => {
  const { manifests, lock } = fixture(); manifests["package.json"].workspaces = ["apps/*"];
  assert.throws(() => checkMonadScope(manifests, lock, []), /root npm workspace/);
  manifests["package.json"].workspaces = ["apps/monad-web"];
  manifests["services/new/package.json"] = {};
  assert.throws(() => checkMonadScope(manifests, lock, []), /Review new/);
});
test("isolates the multi-chain CRE SDK from the Monad app, API and contract tools", () => {
  const { manifests, lock } = fixture();
  manifests["integrations/chainlink-cre/pool-health/package.json"].dependencies["@chainlink/cre-sdk"] = "1.21.1";
  checkMonadScope(manifests, lock, []);
  for (const file of manifestPaths.filter(p => !p.startsWith("integrations/chainlink-cre/"))) {
    manifests[file].dependencies["@chainlink/cre-sdk"] = "1.21.1";
    assert.throws(() => checkMonadScope(manifests, lock, []), /isolated workflow/);
    delete manifests[file].dependencies["@chainlink/cre-sdk"];
  }
});
test("rejects stale workspaces and links left in the lockfile", () => {
  for (const mutate of [
    lock => { lock.packages[""].workspaces = ["apps/*"]; },
    lock => { lock.packages["packages/sdk"] = {}; },
    lock => { lock.packages["node_modules/legacy"] = { link: true, resolved: "packages/sdk" }; },
  ]) {
    const { manifests, lock } = fixture(); mutate(lock);
    assert.throws(() => checkMonadScope(manifests, lock, []));
  }
});
test("rejects retired deployable files even if they have no package manifest", () => {
  for (const file of ["api/drip.mjs", "services/faucet-server.mjs", "apps/web/index.html",
    "packages/sdk/src/index.ts", "devnet-faucet-mints.json", "Dockerfile.base-api", "contracts/.github/workflows/ci.yml"]) {
    const { manifests, lock } = fixture();
    assert.throws(() => checkMonadScope(manifests, lock, [file]), /Retired application/);
  }
});
