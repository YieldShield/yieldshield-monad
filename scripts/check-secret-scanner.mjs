// Verify that public-identifier exceptions do not hide signing keys elsewhere.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scanner = process.argv[2] || 'gitleaks';
const config = resolve(root, '.gitleaks.toml');
const knownDevelopmentKey = readFileSync(resolve(root, 'contracts/Makefile'), 'utf8')
  .match(/^LOCALHOST_ANVIL_PRIVATE_KEY.*?(0x[0-9a-fA-F]{64})/m)?.[1];
assert.ok(knownDevelopmentKey, 'The public Anvil fixture must exist');

const fixtures = [
  ['new signing key', 'config.js', `const PRIVATE_KEY = "0x${randomBytes(32).toString('hex')}";`, 1],
  ['unprefixed signing key', 'config.js', `const PRIVATE_KEY = "${randomBytes(32).toString('hex')}";`, 1],
  ['typed TypeScript signing key', 'config.ts', `const privateKey: string = "0x${randomBytes(32).toString('hex')}";`, 1],
  ['typed Hex signing key', 'config.ts', `const privateKey: Hex = "0x${randomBytes(32).toString('hex')}";`, 1],
  ['command-line signing key', 'deploy.sh', `cast wallet import --private-key 0x${randomBytes(32).toString('hex')}`, 1],
  ['command-line equals signing key', 'deploy.sh', `cast wallet import --private-key="0x${randomBytes(32).toString('hex')}"`, 1],
  ['literal account signing key', 'config.js', `privateKeyToAccount("0x${randomBytes(32).toString('hex')}");`, 1],
  ['public token address', 'config.js', 'const token = "0xA437345Be29EC6802024A8e090E34b621b92E5E2";', 0],
  ['known localhost fixture', 'contracts/Makefile', `LOCALHOST_ANVIL_PRIVATE_KEY ?= ${knownDevelopmentKey}`, 0],
  ['development key outside approved path', 'config.js', `const PRIVATE_KEY = "${knownDevelopmentKey}";`, 1],
  ['replacement key in localhost Makefile', 'contracts/Makefile', `LOCALHOST_ANVIL_PRIVATE_KEY ?= 0x${randomBytes(32).toString('hex')}`, 1],
  ['new key beside localhost fixture', 'contracts/Makefile', `LOCALHOST_ANVIL_PRIVATE_KEY ?= ${knownDevelopmentKey}\nPRIVATE_KEY = "0x${randomBytes(32).toString('hex')}"`, 1],
  ['new key in release evidence', 'docs/evidence/expanded-release.json', JSON.stringify({
    apiCommit: randomBytes(20).toString('hex'), privateKey: `0x${randomBytes(32).toString('hex')}`,
  }), 1],
  ['new key in deployment history', 'contracts/deployments/history/46630/gen-1784273997897-28161ae24b7d9b27.json', JSON.stringify({
    YSToken: `0x${randomBytes(32).toString('hex')}`, privateKey: `0x${randomBytes(32).toString('hex')}`,
  }), 1],
  ['API key beside localhost fixture', 'contracts/Makefile', `LOCALHOST_ANVIL_PRIVATE_KEY ?= ${knownDevelopmentKey}\nAPI_KEY = "${randomBytes(24).toString('base64url')}"`, 1],
  ['API key in release evidence', 'docs/evidence/expanded-release.json', JSON.stringify({
    apiCommit: randomBytes(20).toString('hex'), api_key: randomBytes(24).toString('base64url'),
  }), 1],
  ['API key in deployment history', 'contracts/deployments/history/46630/gen-1784273997897-28161ae24b7d9b27.json', JSON.stringify({
    YSToken: `0x${randomBytes(32).toString('hex')}`, api_key: randomBytes(24).toString('base64url'),
  }), 1],
  ['default generic API-key rule retained', 'config.js', `const api_key = "${randomBytes(24).toString('base64url')}";`, 1],
  ['public code hash', 'config.js', `const codeHash = "0x${randomBytes(32).toString('hex')}";`, 0],
  ['public release identifiers', 'docs/evidence/expanded-release.json', JSON.stringify({
    apiCommit: randomBytes(20).toString('hex'), apiDeployment: '3b977f83-eb55-4afc-8b33-13c81de781f2',
  }), 0],
  ['historical token code hash', 'contracts/deployments/history/46630/gen-1784273997897-28161ae24b7d9b27.json', JSON.stringify({
    YSToken: `0x${randomBytes(32).toString('hex')}`,
  }), 0],
];
for (const [name, path, content, expected] of fixtures) {
  const directory = mkdtempSync(join(tmpdir(), 'yieldshield-secret-control-'));
  try {
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    const result = spawnSync(scanner, ['dir', '.', '--config', config, '--redact=100', '--no-banner', '--ignore-gitleaks-allow'], {
      cwd: directory, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.status, expected, `${name}: scanner failed its control check (output intentionally withheld)`);
    console.log(`PASS ${name}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
