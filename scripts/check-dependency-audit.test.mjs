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
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .sort();
  const covered = auditedDirectories
    .map((directory) => (directory === "." ? "package-lock.json" : `${directory}/package-lock.json`))
    .sort();
  assert.deepEqual(covered, files, "Add every new lockfile to the dependency audit gate");
});
function fixture() {
  return {
    report: {
      metadata: { vulnerabilities: { total: 1 } },
      vulnerabilities: {
        "bigint-buffer": {
          severity: "high",
          nodes: ["node_modules/bigint-buffer"],
          via: [
            {
              name: "bigint-buffer",
              dependency: "bigint-buffer",
              severity: "high",
              url: "https://github.com/advisories/GHSA-3gc7-fjrx-p6mg",
            },
          ],
        },
      },
    },
    lock: { packages: { "node_modules/bigint-buffer": { version: "1.1.5" } } },
  };
}

test("accepts a complete clean production audit", () => {
  assert.equal(checkAudit({ vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } }), 0);
});
test("rejects the former bigint-buffer exception for every caller and date", () => {
  const { report, lock } = fixture();
  assert.throws(() => checkAudit(report, lock, options), /Unreviewed/);
  assert.throws(() => checkAudit(report, lock, { now: Date.parse("2026-10-20") }), /Unreviewed/);
});
test("rejects inherited findings, unknown advisories and inconsistent reports", () => {
  for (const name of ["@dynamic-labs/ethereum", "@solana/buffer-layout-utils", "unknown"]) {
    const report = {
      vulnerabilities: { [name]: { severity: "high", via: ["bigint-buffer"] } },
      metadata: { vulnerabilities: { total: 1 } },
    };
    assert.throws(() => checkAudit(report), /Unreviewed/);
  }
  assert.throws(() => checkAudit({ error: { code: "ENOTFOUND" } }), /Incomplete/);
  assert.throws(() => checkAudit({ vulnerabilities: {}, metadata: { vulnerabilities: { total: 1 } } }), /summary/);
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
  for (const source of [
    "apps/web/src/App.tsx",
    "packages/sdk/src/index.ts",
    "packages/adapter-solana/dist/index.js",
    "packages/adapter-evm/src/index.ts",
    "packages/core/src/index.ts",
  ]) {
    assert.throws(() => checkBrowserModules([entry, `/repo/${source}`]), /Retired application workspace/);
  }
});

test("rejects the removed stream-json exception even at its previously reviewed version", () => {
  const { report, lock } = fixture();
  report.vulnerabilities["stream-json"] = {
    severity: "moderate",
    nodes: ["node_modules/stream-json"],
    via: [
      {
        name: "stream-json",
        dependency: "stream-json",
        severity: "moderate",
        url: "https://github.com/advisories/GHSA-528h-pc64-c93x",
      },
    ],
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
    done(
      null,
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        ...(request.method === "fail"
          ? { error: { code: -32601, message: "Unknown method" } }
          : { result: request.params[0] }),
      }),
    );
  });
  await new Promise((resolve, reject) =>
    client.request("echo", [42], (error, response) => {
      if (error) return reject(error);
      assert.equal(response.result, 42);
      resolve();
    }),
  );
  await new Promise((resolve, reject) =>
    client.request("fail", [], (error, rpcError, result) => {
      if (error) return reject(error);
      assert.equal(rpcError.code, -32601);
      assert.equal(result, undefined);
      resolve();
    }),
  );
  const custom = new Client(() => {}, { generator: () => "wallet-request" });
  assert.equal(custom.request("echo", []).id, "wallet-request");
  assert.equal(custom.request("echo", [], 7).id, 7);
  assert.equal(custom.request("notify", [], null).id, undefined);
});

test("bigint conversion uses the local JavaScript implementation for large buffers", () => {
  const { realpathSync } = require("node:fs");
  const resolved = require.resolve("bigint-buffer");
  assert.match(realpathSync(resolved).replaceAll("\\", "/"), /\/vendor\/bigint-buffer\/dist\/node\.js$/);
  const { toBigIntLE, toBigIntBE, toBufferLE, toBufferBE } = require("bigint-buffer");
  for (const size of [0, 1, 7, 8, 9, 31, 32, 33, 64, 65, 4096]) {
    const bytes = Buffer.alloc(size, 0x7f);
    const expected = size ? BigInt("0x" + bytes.toString("hex")) : 0n;
    assert.equal(toBigIntLE(bytes), expected);
    assert.equal(toBigIntBE(bytes), expected);
    assert.deepEqual(toBufferLE(expected, size), bytes);
    assert.deepEqual(toBufferBE(expected, size), bytes);
    assert.deepEqual(bytes, Buffer.alloc(size, 0x7f));
  }
});
