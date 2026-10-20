import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const auditedDirectories = [".", "services/monad", "contracts"];

// The native bigint-buffer implementation has been replaced with the reviewed
// local JavaScript implementation. No production advisory is exempted.
export function checkAudit(report) {
  if (report.error || !report.vulnerabilities || !report.metadata?.vulnerabilities) {
    throw new Error("Incomplete npm audit response; refusing to treat it as a clean audit");
  }
  const findings = Object.keys(report.vulnerabilities);
  if (report.metadata.vulnerabilities.total !== findings.length) {
    throw new Error("npm audit summary does not match its findings");
  }
  if (findings.length) throw new Error(`Unreviewed dependency findings: ${findings.join(", ")}`);
  return 0;
}

export function checkBrowserModules(moduleIds) {
  const ids = [...moduleIds].map((id) => id.replaceAll("\\", "/"));
  if (!ids.some((id) => id.includes("/src/DynamicWallet.tsx"))) {
    throw new Error("Browser verification did not include the Dynamic wallet entry");
  }
  for (const id of ids) {
    if (/\/(?:apps\/web|packages\/(?:sdk|adapter-solana|adapter-evm|core))\//.test(id)) {
      throw new Error(`Retired application workspace entered the browser bundle: ${id}`);
    }
    if (
      id.includes("/node_modules/stream-json/") ||
      (id.includes("/node_modules/bigint-buffer/") && !id.includes("/dist/browser.js")) ||
      /\/node_modules\/jayson\/lib\/(utils|server)([/.])/.test(id)
    ) {
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
  const accepted = checkAudit(root.report);
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
    plugins: [
      {
        name: "verify-dependency-exposure",
        generateBundle(_options, bundle) {
          for (const item of Object.values(bundle)) {
            if (item.type === "chunk") for (const id of Object.keys(item.modules)) modules.add(id);
          }
          checkBrowserModules(modules);
          checkedBundle = true;
        },
      },
    ],
  });
  if (!checkedBundle) throw new Error("Browser module verification did not run");
  const advisoryCount = Object.values(root.report.vulnerabilities).flatMap((finding) =>
    finding.via.filter((cause) => typeof cause !== "string"),
  ).length;
  console.log(
    `Dependency check passed: ${accepted} root findings from ${advisoryCount} reviewed advisories; Monad API and contract tools clean.`,
  );
  console.log(
    `Verified ${modules.size} emitted browser modules: no stream-json or native bigint-buffer implementation.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
