import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const manifestPaths = [
  "package.json", "apps/monad-web/package.json", "services/monad/package.json", "contracts/package.json",
  "integrations/chainlink-cre/pool-health/package.json",
];
const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const solanaDependency = /^(?:@solana(?:-program)?\/|@codama\/|codama(?:@|$)|@yieldshield\/(?:sdk|adapter-solana)(?:@|$))/;

export function checkMonadScope(manifests, lock, trackedFiles) {
  assert.deepEqual(Object.keys(manifests).sort(), [...manifestPaths].sort(),
    "Review new application/tool manifests before expanding the Monad repository scope");
  assert.deepEqual(manifests["package.json"].workspaces, ["apps/monad-web"],
    "Only the Monad frontend belongs in the root npm workspace");
  assert.deepEqual(lock.packages?.[""]?.workspaces, ["apps/monad-web"],
    "Regenerate the lockfile for the Monad-only workspace");

  for (const [file, manifest] of Object.entries(manifests)) {
    for (const field of dependencyFields) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        assert(name !== "@chainlink/cre-sdk" || file === "integrations/chainlink-cre/pool-health/package.json",
          "The CRE SDK belongs only in its isolated workflow toolchain");
        const alias = typeof version === "string" && version.startsWith("npm:") ? version.slice(4) : "";
        assert(!solanaDependency.test(name) && !solanaDependency.test(alias),
          `${file}: direct Solana/codegen dependency ${name}; Dynamic's transitive dependencies are allowed`);
      }
    }
  }
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location.includes("node_modules/") && location !== "") {
      assert.equal(location, "apps/monad-web", `Retired workspace in lockfile: ${location}`);
    }
    if (entry.link) assert.equal(entry.resolved, "apps/monad-web", `Unexpected workspace link: ${location}`);
  }
  for (const file of trackedFiles) {
    assert(!/^(?:apps\/(?!monad-web\/)|packages\/|services\/(?!monad\/)|api\/|contracts\/\.github\/)/.test(file)
      && !["devnet-faucet-mints.json", "Dockerfile.base-api"].includes(file),
    `Retired application or deployment entry point: ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const manifests = Object.fromEntries(files.filter((file) => /(^|\/)package\.json$/.test(file))
    .map((file) => [file, JSON.parse(readFileSync(path.join(root, file), "utf8"))]));
  checkMonadScope(manifests, JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8")), files);
  console.log("Monad repository scope verified: one app workspace, no direct Solana dependencies or retired entry points.");
}
