import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exceptionExpiry = "2026-10-16T00:00:00Z";
export const auditedDirectories = [".", "services/monad", "services", "contracts"];

// These exceptions require the browser-bundle check below. They do not apply
// to the API or to Node/SSR applications. See docs/DEPENDENCY_SECURITY.md.
const exceptions = {
  "bigint-buffer": {
    version: "1.1.5",
    node: "node_modules/bigint-buffer",
    url: "https://github.com/advisories/GHSA-3gc7-fjrx-p6mg",
    severity: "high",
  },
  "stream-json": {
    version: "1.9.1",
    node: "node_modules/stream-json",
    url: "https://github.com/advisories/GHSA-528h-pc64-c93x",
    severity: "moderate",
  },
};
const inheritedVersions = {
  "@dynamic-labs/ethereum": "5.8.1",
  "@dynamic-labs/solana-core": "5.8.1",
  "@dynamic-labs/waas": "5.8.1",
  "@dynamic-labs/waas-evm": "5.8.1",
  "@solana/buffer-layout-utils": "0.2.0",
  "@solana/spl-token": "0.4.14",
  jayson: "4.3.0",
};

export function checkAudit(report, lock, { allowBrowserExceptions = false, now = Date.now() } = {}) {
  if (report.error || !report.vulnerabilities || !report.metadata?.vulnerabilities) {
    throw new Error("Incomplete npm audit response; refusing to treat it as a clean audit");
  }
  const findings = report.vulnerabilities;
  const reviewed = new Set();
  function visit(name, ancestors = new Set()) {
    if (reviewed.has(name)) return;
    const finding = findings[name];
    if (!finding || ancestors.has(name) || !Array.isArray(finding.via) || !finding.via.length) {
      throw new Error(`Unresolved audit dependency: ${name}`);
    }
    if (finding.severity === "critical") throw new Error(`Critical dependency finding: ${name}`);
    if (!exceptions[name]) {
      const node = `node_modules/${name}`;
      if (!allowBrowserExceptions || !inheritedVersions[name] || finding.nodes?.length !== 1 ||
          finding.nodes[0] !== node || lock.packages?.[node]?.version !== inheritedVersions[name]) {
        throw new Error(`Unreviewed dependency path or version: ${name}`);
      }
    }
    const next = new Set(ancestors).add(name);
    for (const cause of finding.via) {
      if (typeof cause === "string") {
        visit(cause, next);
        continue;
      }
      const allowed = allowBrowserExceptions ? exceptions[name] : undefined;
      if (!allowed || cause.name !== name || cause.dependency !== name || cause.url !== allowed.url ||
          cause.severity !== allowed.severity || finding.severity !== allowed.severity) {
        throw new Error(`Unreviewed dependency advisory: ${name} (${cause.url ?? "missing advisory URL"})`);
      }
      if (now >= Date.parse(exceptionExpiry)) throw new Error(`Dependency exception expired: ${name}`);
      if (finding.nodes?.length !== 1 || finding.nodes[0] !== allowed.node ||
          lock.packages?.[allowed.node]?.version !== allowed.version) {
        throw new Error(`Dependency exception version/path changed: ${name}`);
      }
    }
    reviewed.add(name);
  }
  for (const name of Object.keys(findings)) visit(name);
  const count = Object.keys(findings).length;
  if (report.metadata.vulnerabilities.total !== count) {
    throw new Error("npm audit summary does not match its findings");
  }
  return count;
}

export function checkBrowserModules(moduleIds) {
  const ids = [...moduleIds].map((id) => id.replaceAll("\\", "/"));
  if (!ids.some((id) => id.includes("/src/DynamicWallet.tsx"))) {
    throw new Error("Browser verification did not include the Dynamic wallet entry");
  }
  for (const id of ids) {
    if (id.includes("/node_modules/stream-json/") ||
        (id.includes("/node_modules/bigint-buffer/") && !id.includes("/dist/browser.js")) ||
        /\/node_modules\/jayson\/lib\/(utils|server)([/.])/.test(id)) {
      throw new Error(`Browser dependency exception is no longer valid: ${id}`);
    }
  }
}

function audit(directory) {
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: directory,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error(`npm audit could not complete for ${path.relative(repo, directory) || "root"}`);
  }
  const report = JSON.parse(result.stdout);
  const lock = JSON.parse(readFileSync(path.join(directory, "package-lock.json"), "utf8"));
  return { report, lock };
}

async function main() {
  const root = audit(repo);
  const accepted = checkAudit(root.report, root.lock, { allowBrowserExceptions: true });
  for (const directory of auditedDirectories.filter((directory) => directory !== ".")) {
    const tooling = audit(path.join(repo, directory));
    checkAudit(tooling.report, tooling.lock);
    console.log(`Production dependency audit clean: ${directory}`);
  }
  const { build } = await import("vite");
  let checkedBundle = false;
  const modules = new Set();
  await build({
    root: path.join(repo, "apps/monad-web"),
    logLevel: "error",
    build: { write: false },
    plugins: [{
      name: "verify-dependency-exposure",
      generateBundle(_options, bundle) {
        for (const item of Object.values(bundle)) {
          if (item.type === "chunk") for (const id of Object.keys(item.modules)) modules.add(id);
        }
        checkBrowserModules(modules);
        checkedBundle = true;
      },
    }],
  });
  if (!checkedBundle) throw new Error("Browser module verification did not run");
  const advisoryCount = Object.values(root.report.vulnerabilities)
    .flatMap((finding) => finding.via.filter((cause) => typeof cause !== "string")).length;
  console.log(`Dependency check passed: ${accepted} root findings from ${advisoryCount} reviewed advisories; both APIs and contract tools clean.`);
  console.log(`Verified ${modules.size} emitted browser modules: no stream-json or native bigint-buffer implementation.`);
  if (accepted) console.log(`Browser-only exceptions expire ${exceptionExpiry.slice(0, 10)}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
