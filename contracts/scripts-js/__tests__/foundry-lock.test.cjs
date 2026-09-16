const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { checkFoundryLock } = require("../check-foundry-lock.cjs");

const pinned = "1".repeat(40);
const changed = "2".repeat(40);
function fixture(t, nested = true) {
    const root = mkdtempSync(join(tmpdir(), "foundry-lock-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const contracts = nested ? join(root, "contracts") : root;
    mkdirSync(contracts, { recursive: true });
    const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q");
    const path = `${nested ? "contracts/" : ""}lib/example`;
    writeFileSync(
        join(root, ".gitmodules"),
        `[submodule "example"]\npath = ${path}\nurl = https://example.invalid/library.git\n`,
    );
    git("update-index", "--add", "--cacheinfo", `160000,${pinned},${path}`);
    const lock = { "lib/example": { tag: { name: "v1.0.0", rev: pinned } } };
    const save = () => writeFileSync(join(contracts, "foundry.lock"), JSON.stringify(lock));
    save();
    return { root, contracts, git, path, lock, save };
}

for (const nested of [true, false])
    test(`lock check supports ${nested ? "monorepo" : "standalone"} layout`, (t) => {
        const f = fixture(t, nested);
        assert.equal(checkFoundryLock(f.contracts), 1);
    });
test("staged submodule update cannot bypass the deployment lock", (t) => {
    const f = fixture(t);
    f.git("update-index", "--cacheinfo", `160000,${changed},${f.path}`);
    assert.throws(() => checkFoundryLock(f.contracts), /revision mismatch/);
});
test("missing and obsolete lock entries fail closed", (t) => {
    const f = fixture(t);
    delete f.lock["lib/example"];
    f.lock["lib/obsolete"] = { tag: { rev: pinned } };
    f.save();
    assert.throws(
        () => checkFoundryLock(f.contracts),
        (error) => /missing a valid revision/.test(error.message) && /lib\/obsolete/.test(error.message),
    );
});
test("a regular file cannot replace a locked git submodule", (t) => {
    const f = fixture(t);
    f.git("update-index", "--cacheinfo", `100644,${pinned},${f.path}`);
    assert.throws(() => checkFoundryLock(f.contracts), /not an unambiguous git submodule/);
});
test("removing all contract submodules cannot silently pass", (t) => {
    const f = fixture(t);
    writeFileSync(join(f.root, ".gitmodules"), '[submodule "other"]\npath = packages/other\n');
    assert.throws(() => checkFoundryLock(f.contracts), /No contract submodules/);
});
