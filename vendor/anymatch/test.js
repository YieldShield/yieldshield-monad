"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const anymatch = require("./index.js");

// unstorage's fs driver, the only consumer, builds its ignore matcher this way.
const ignore = anymatch(["**/node_modules/**", "**/.git/**"]);
assert.equal(ignore("node_modules/pkg/index.js"), true);
assert.equal(ignore("app/node_modules/pkg/index.js"), true);
assert.equal(ignore("app\\node_modules\\pkg\\index.js"), true);
assert.equal(ignore(".git/HEAD"), true);
assert.equal(ignore("src/.git/config"), true);
assert.equal(ignore("src/storage/key.json"), false);
// Like picomatch, a trailing "/**" also matches the directory itself, so the
// fs driver skips these directories instead of descending into them.
assert.equal(ignore("node_modules"), true);
assert.equal(ignore("a/.git"), true);
assert.equal(ignore("node_modules_backup/key.json"), false);

// Upstream anymatch behaviour: strings, globs, regexes, functions, negation,
// return indexes, curried testers and argument lists.
const matchers = [
  "path/to/file.js",
  "path/anyjs/**/*.js",
  /foo.js$/,
  (string) => string.includes("bar") && string.length > 10,
];
assert.equal(anymatch(matchers, "path/to/file.js"), true);
assert.equal(anymatch(matchers, "path/anyjs/baz.js"), true);
assert.equal(anymatch(matchers, "path/anyjs/deep/baz.js"), true);
assert.equal(anymatch(matchers, "path/to/foo.js"), true);
assert.equal(anymatch(matchers, "path/to/bar.js"), true);
assert.equal(anymatch(matchers, "bar.js"), false);
assert.equal(anymatch(matchers, "path/anyjs/baz.js", true), 1);
assert.equal(anymatch(matchers, "nothing.txt", true), -1);
assert.equal(anymatch("node_modules", "node_modules"), true);
assert.equal(anymatch("node_modules", "node_modules/somelib/index.js"), false);
assert.equal(anymatch("node_modules/**", "node_modules/somelib/index.js"), true);
assert.equal(anymatch("**/node_modules/**", "/absolute/path/to/node_modules/somelib/index.js"), true);
assert.equal(anymatch(["**/*.js", "!**/vendor/**"], "src/vendor/lib.js"), false);
assert.equal(anymatch(["**/*.js", "!**/vendor/**"], "src/lib.js"), true);
assert.equal(anymatch(["**/*.js", "!**/vendor/**"], "src/vendor/lib.js", true), -1);
assert.equal(anymatch("*.js", ".hidden.js"), false);
assert.equal(anymatch("*.js", ".hidden.js", { dot: true }), true);
const tester = anymatch(matchers);
assert.equal(tester("path/to/file.js"), true);
assert.equal(tester("path/anyjs/baz.js", true), 1);
assert.equal(tester("nothing.txt"), false);
assert.equal(
  anymatch((file, stats) => file === "a.js" && stats === "file", ["a.js", "file"]),
  true,
);
assert.equal(anymatch(/a\.js$/, ["a.js", "file"]), true);
assert.throws(() => anymatch(), /specify first argument/);
assert.throws(() => anymatch("*.js", 7), /second argument must be a string/);
assert.equal(anymatch.default, anymatch);

// GHSA-fc5q-39xc-vjpf: single-branch repeated extglobs must not backtrack
// exponentially. Upstream anymatch 3.1.3 with picomatch 2.3.2 was still running
// after 5 seconds on "+(*a)" with this input.
for (const glob of ["+(*)", "+(*a)", "*(*a)", "+(a*)"]) {
  const started = process.hrtime.bigint();
  anymatch(glob, "a".repeat(64) + "!");
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 1000, `${glob} took ${elapsedMs} ms`);
}

// picomatch must not be reachable from this package.
const source = readFileSync(path.join(__dirname, "index.js"), "utf8");
assert.doesNotMatch(source, /require\(['"]picomatch['"]\)/);
assert.deepEqual(Object.keys(require("./package.json").dependencies), ["minimatch"]);

console.log("anymatch compatibility checks passed");
