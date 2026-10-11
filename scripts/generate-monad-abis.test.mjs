import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { generateMonadAbis } from "./generate-monad-abis.mjs";

test("ABI regeneration needs no deployment manifest and preserves published deployment records", () => {
  const directory = mkdtempSync(join(tmpdir(), "yieldshield-monad-abis-"));
  try {
    const abis = JSON.parse(readFileSync(new URL("../config/abis.json", import.meta.url), "utf8"));
    for (const [name, abi] of Object.entries(abis)) {
      const artifactDirectory = join(directory, "contracts", "out", `${name}.sol`);
      mkdirSync(artifactDirectory, { recursive: true });
      writeFileSync(join(artifactDirectory, `${name}.json`), JSON.stringify({ abi }));
    }
    mkdirSync(join(directory, "config"));
    const deployment = '{"address":"published deployment must stay unchanged"}\n';
    writeFileSync(join(directory, "config", "deployment.json"), deployment);

    generateMonadAbis(pathToFileURL(`${directory}/`));

    assert.deepEqual(JSON.parse(readFileSync(join(directory, "config", "abis.json"), "utf8")), abis);
    assert.equal(readFileSync(join(directory, "config", "deployment.json"), "utf8"), deployment);
    const browser = JSON.parse(readFileSync(join(directory, "config", "browser-abis.json"), "utf8"));
    assert(browser.SplitRiskPool.some((entry) => entry.name === "claimCommission"));
    assert(!browser.SplitRiskPool.some((entry) => entry.name === "initialize"));
    assert.deepEqual(
      browser.SplitRiskPool.filter((entry) => entry.type === "error"),
      abis.SplitRiskPool.filter((entry) => entry.type === "error"),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
