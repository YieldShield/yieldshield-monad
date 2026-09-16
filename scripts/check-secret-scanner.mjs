// Verify that public-identifier exceptions do not hide signing keys elsewhere.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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

const customPoolRelease = readFileSync(resolve(root, 'docs/CUSTOM_POOL_TERMS.md'), 'utf8')
  .match(/^- Railway API: `([0-9a-f-]{36})`, successful\.$/m)?.[0];
assert.ok(customPoolRelease, 'The public Railway release record must exist');

// Generic API-key detection ignores letter-only values and requires entropy > 3.5.
// Random base64/UUID fixtures can miss those criteria, making CI fail at random.
// Generate synthetic values with a stable mix of letters and digits instead.
const apiKeyFixture = Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString('base64url');
const uuidFixture = ['12345678', '9abc', '4def', '8012', '3456789abcde'].join('-');

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
  ['API key beside localhost fixture', 'contracts/Makefile', `LOCALHOST_ANVIL_PRIVATE_KEY ?= ${knownDevelopmentKey}\nAPI_KEY = "${apiKeyFixture}"`, 1],
  ['API key in release evidence', 'docs/evidence/expanded-release.json', JSON.stringify({
    apiCommit: randomBytes(20).toString('hex'), api_key: apiKeyFixture,
  }), 1],
  ['API key in deployment history', 'contracts/deployments/history/46630/gen-1784273997897-28161ae24b7d9b27.json', JSON.stringify({
    YSToken: `0x${randomBytes(32).toString('hex')}`, api_key: apiKeyFixture,
  }), 1],
  ['default generic API-key rule retained', 'config.js', `const api_key = "${apiKeyFixture}";`, 1],
  ['historical deployment identifier in scanner controls', 'scripts/check-secret-scanner.mjs',
    'const apiDeployment = "3b977f83-eb55-4afc-8b33-13c81de781f2";', 0],
  ['new API key in scanner controls', 'scripts/check-secret-scanner.mjs',
    `const api_key = "${apiKeyFixture}";`, 1],
  ['other UUID secret in scanner controls', 'scripts/check-secret-scanner.mjs',
    `const api_key = "${uuidFixture}";`, 1],
  ['public custom-pool release identifier', 'docs/CUSTOM_POOL_TERMS.md', customPoolRelease, 0],
  ['other UUID in custom-pool release', 'docs/CUSTOM_POOL_TERMS.md',
    customPoolRelease.replace(/[0-9a-f-]{36}/, uuidFixture), 1],
  ['release identifier outside approved path', 'docs/other-release.md', customPoolRelease, 1],
  ['API key beside custom-pool release identifier', 'docs/CUSTOM_POOL_TERMS.md',
    `${customPoolRelease}\nAPI_KEY = "${apiKeyFixture}"`, 1],
  ['signing key beside custom-pool release identifier', 'docs/CUSTOM_POOL_TERMS.md',
    `${customPoolRelease}\nPRIVATE_KEY = "0x${randomBytes(32).toString('hex')}"`, 1],
  ['public code hash', 'config.js', `const codeHash = "0x${randomBytes(32).toString('hex')}";`, 0],
  ['public release identifiers', 'docs/evidence/expanded-release.json', JSON.stringify({
    apiCommit: randomBytes(20).toString('hex'), apiDeployment: randomUUID(),
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
