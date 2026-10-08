import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { auditedDirectories, checkAudit, checkBrowserModules } from "./check-dependency-audit.mjs";

const now = Date.parse("2026-09-16T00:00:00Z");
const options = { now, allowBrowserExceptions: true };
const require = createRequire(import.meta.url);
test("audits every committed npm lockfile, including standalone tooling", () => {
  const files = execFileSync("git", ["ls-files", "*package-lock.json"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8",
  }).trim().split("\n").sort();
  const covered = auditedDirectories.map((directory) =>
    directory === "." ? "package-lock.json" : `${directory}/package-lock.json`).sort();
  assert.deepEqual(covered, files, "Add every new lockfile to the dependency audit gate");
});
function fixture() {
  return {
    report: {
      metadata: { vulnerabilities: { total: 1 } },
      vulnerabilities: {
        "bigint-buffer": {
          severity: "high", nodes: ["node_modules/bigint-buffer"],
          via: [{ name: "bigint-buffer", dependency: "bigint-buffer", severity: "high",
            url: "https://github.com/advisories/GHSA-3gc7-fjrx-p6mg" }],
        },
      },
    },
    lock: { packages: { "node_modules/bigint-buffer": { version: "1.1.5" } } },
  };
}

test("accepts only the reviewed advisory and rejects it for the API", () => {
  const { report, lock } = fixture();
  assert.equal(checkAudit(report, lock, options), 1);
  assert.throws(() => checkAudit(report, lock, { now }), /Unreviewed/);
});
test("rejects changed advisory IDs, critical severity, versions, paths and expired review", () => {
  for (const change of [
    ({ report }) => { report.vulnerabilities["bigint-buffer"].via[0].url += "-new"; },
    ({ report }) => { report.vulnerabilities["bigint-buffer"].severity = "critical"; },
    ({ lock }) => { lock.packages["node_modules/bigint-buffer"].version = "1.1.6"; },
    ({ report }) => { report.vulnerabilities["bigint-buffer"].nodes.push("node_modules/other/node_modules/bigint-buffer"); },
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => checkAudit(f.report, f.lock, options));
  }
  const { report, lock } = fixture();
  assert.throws(() => checkAudit(report, lock, { ...options, now: Date.parse("2026-10-16") }), /expired/);
});
test("rejects unknown inherited dependencies and missing audit data", () => {
  const { report, lock } = fixture();
  report.vulnerabilities["new-parent"] = { severity: "high", nodes: ["node_modules/new-parent"], via: ["bigint-buffer"] };
  report.metadata.vulnerabilities.total++;
  assert.throws(() => checkAudit(report, lock, options), /Unreviewed/);
  assert.throws(() => checkAudit({ error: { code: "ENOTFOUND" } }, lock, options), /Incomplete/);
});
test("allows reviewed inheritance but still rejects a new advisory on an inherited package", () => {
  const { report, lock } = fixture();
  const name = "@solana/buffer-layout-utils";
  report.vulnerabilities[name] = { severity: "high", nodes: [`node_modules/${name}`], via: ["bigint-buffer"] };
  lock.packages[`node_modules/${name}`] = { version: "0.2.0" };
  report.metadata.vulnerabilities.total++;
  assert.equal(checkAudit(report, lock, options), 2);
  report.vulnerabilities[name].via.push({ name, dependency: name, severity: "high", url: "https://github.com/advisories/new" });
  assert.throws(() => checkAudit(report, lock, options), /Unreviewed/);
});
test("verifies the complete Dynamic bundle and rejects native or server parser code", () => {
  const entry = "/repo/apps/monad-web/src/DynamicWallet.tsx";
  assert.doesNotThrow(() => checkBrowserModules([entry, "/repo/node_modules/bigint-buffer/dist/browser.js"]));
  assert.throws(() => checkBrowserModules([]), /Dynamic wallet entry/);
  for (const source of ["bigint-buffer/dist/node.js", "stream-json/filters/FilterBase.js", "jayson/lib/utils.js"]) {
    assert.throws(() => checkBrowserModules([entry, `/repo/node_modules/${source}`]), /no longer valid/);
  }
});

test("rejects retired first-party workspaces in the browser bundle", () => {
  const entry = "/repo/apps/monad-web/src/DynamicWallet.tsx";
  for (const source of ["apps/web/src/App.tsx", "packages/sdk/src/index.ts",
    "packages/adapter-solana/dist/index.js", "packages/adapter-evm/src/index.ts", "packages/core/src/index.ts"]) {
    assert.throws(() => checkBrowserModules([entry, `/repo/${source}`]), /Retired application workspace/);
  }
});

test("rejects the removed stream-json exception even at its previously reviewed version", () => {
  const { report, lock } = fixture();
  report.vulnerabilities["stream-json"] = {
    severity: "moderate", nodes: ["node_modules/stream-json"],
    via: [{ name: "stream-json", dependency: "stream-json", severity: "moderate",
      url: "https://github.com/advisories/GHSA-528h-pc64-c93x" }],
  };
  report.metadata.vulnerabilities.total++;
  lock.packages["node_modules/stream-json"] = { version: "1.9.1" };
  assert.throws(() => checkAudit(report, lock, options), /Unreviewed/);
});

test("Jayson browser override preserves JSON-RPC IDs, success and error callbacks", async () => {
  const Client = require("jayson/lib/client/browser");
  const client = new Client((body, done) => {
    const request = JSON.parse(body);
    assert.equal(request.jsonrpc, "2.0");
    assert.match(request.id, /^[0-9a-f-]{36}$/i);
    done(null, JSON.stringify({ jsonrpc: "2.0", id: request.id,
      ...(request.method === "fail" ? { error: { code: -32601, message: "Unknown method" } }
        : { result: request.params[0] }) }));
  });
  await new Promise((resolve, reject) => client.request("echo", [42], (error, response) => {
    if (error) return reject(error);
    assert.equal(response.result, 42);
    resolve();
  }));
  await new Promise((resolve, reject) => client.request("fail", [], (error, rpcError, result) => {
    if (error) return reject(error);
    assert.equal(rpcError.code, -32601);
    assert.equal(result, undefined);
    resolve();
  }));
  const custom = new Client(() => {}, { generator: () => "wallet-request" });
  assert.equal(custom.request("echo", []).id, "wallet-request");
  assert.equal(custom.request("echo", [], 7).id, 7);
  assert.equal(custom.request("notify", [], null).id, undefined);
});
