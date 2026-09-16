#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { readFileSync, realpathSync } = require("node:fs");
const { relative, resolve } = require("node:path");

function checkFoundryLock(contractsRoot = resolve(__dirname, "..")) {
    contractsRoot = realpathSync(contractsRoot);
    const git = (args, cwd = contractsRoot) =>
        execFileSync("git", args, {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    const repositoryRoot = git(["rev-parse", "--show-toplevel"]);
    const prefix = relative(repositoryRoot, contractsRoot).replaceAll("\\", "/");
    const pathPrefix = prefix ? `${prefix}/` : "";
    const paths = git(
        ["config", "--file", resolve(repositoryRoot, ".gitmodules"), "--get-regexp", "path"],
        repositoryRoot,
    )
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[1])
        .filter((path) => path?.startsWith(pathPrefix))
        .map((path) => path.slice(pathPrefix.length));
    if (!paths.length) throw new Error("No contract submodules found in .gitmodules");

    const lock = JSON.parse(readFileSync(resolve(contractsRoot, "foundry.lock"), "utf8"));
    const errors = [];
    for (const path of paths) {
        const lockedRev = lock[path]?.tag?.rev;
        if (!/^[0-9a-f]{40}$/.test(lockedRev || "")) {
            errors.push(`foundry.lock is missing a valid revision for ${path}`);
            continue;
        }
        // Use the index so locally staged dependency changes are checked too.
        const entry = git(["ls-files", "--stage", "--", `${pathPrefix}${path}`], repositoryRoot);
        const match = entry.match(/^160000 ([0-9a-f]{40}) 0\t[^\n]+$/);
        if (!match) {
            errors.push(`${path} is not an unambiguous git submodule in the index`);
        } else if (lockedRev !== match[1]) {
            errors.push(`${path} revision mismatch\n  foundry.lock: ${lockedRev}\n  submodule:    ${match[1]}`);
        }
    }
    for (const path of Object.keys(lock)) {
        if (!paths.includes(path)) errors.push(`foundry.lock contains ${path}, but .gitmodules does not`);
    }
    if (errors.length) throw new Error(errors.join("\n"));
    return paths.length;
}

module.exports = { checkFoundryLock };
if (require.main === module) {
    try {
        console.log(`foundry.lock matches ${checkFoundryLock()} submodule revision(s).`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
