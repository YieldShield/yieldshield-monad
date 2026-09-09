#!/usr/bin/env node
/** Activate only the existing valueless Base Sepolia faucet after independent infrastructure checks. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { ROOT, SequentialDeployment, acquireDeploymentLock } from './deploy-base-sepolia.mjs';
import { EXPECTED_DEPLOYER, verifyBaseFaucetPreparation, publishBaseFaucet } from './sync-base-deployment.mjs';

export async function main() {
  assert(process.argv.length <= 3 && process.argv.slice(2).every(arg => ['--prepare', '--broadcast', '--publish'].includes(arg)), 'Choose exactly one of --prepare, --broadcast, or --publish');
  const broadcast = process.argv.includes('--broadcast'), publish = process.argv.includes('--publish');
  assert(!(broadcast && publish), 'Execute activation and publication separately');
  const release = acquireDeploymentLock(resolve(ROOT, 'contracts/.base-sepolia-deployment.lock'));
  process.once('exit', release);
  process.once('SIGINT', () => { release(); process.exit(130); });
  const manifestPath = resolve(ROOT, 'contracts/deployments/base-sepolia-alpha.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  const scriptHash = createHash('sha256').update(readFileSync(resolve(ROOT, 'scripts/deploy-base-sepolia.mjs'))).digest('hex');
  assert.equal(manifest.scriptHash, scriptHash, 'Reviewed deployment recipe changed');
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/verify-base-modules.mjs')], { cwd: ROOT, stdio: 'inherit' });
  const modules = JSON.parse(readFileSync(resolve(ROOT, 'contracts/config/base-modules.json')));
  const client = createPublicClient({ chain: baseSepolia, transport: http('https://base-sepolia-rpc.publicnode.com', { timeout: 15000, retryCount: 1, batch: true }) });
  if (publish) {
    const verified = await publishBaseFaucet({ manifest, modules, client, outputPath: resolve(ROOT, 'packages/adapter-evm/src/faucet-deployments.ts') });
    console.log(`Published only the independently verified faucet ${verified.faucet}. Protocol publication remains gated on complete pool activation.`);
    return;
  }
  const verified = await verifyBaseFaucetPreparation({ manifest, modules, client });
  const env = {};
  let account = { address: EXPECTED_DEPLOYER };
  if (broadcast) {
    const path = resolve(ROOT, 'contracts/.env.base.local');
    assert(existsSync(path), 'Dedicated testnet wallet configuration missing');
    execFileSync('git', ['check-ignore', '--quiet', path], { cwd: ROOT, stdio: 'ignore' });
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
    account = privateKeyToAccount(env.BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY);
    assert.equal(account.address.toLowerCase(), EXPECTED_DEPLOYER.toLowerCase());
  }
  const run = new SequentialDeployment({ client, account, broadcast, manifestPath, manifest, nonce: await client.getTransactionCount({ address: EXPECTED_DEPLOYER, blockTag: 'pending' }), maxFeePerGas: BigInt(env.BASE_SEPOLIA_MAX_FEE_PER_GAS_WEI ?? '1000000000'), spendLimit: parseEther(env.BASE_SEPOLIA_MAX_TOTAL_FEE_ETH ?? '0.02') });
  for (const asset of manifest.assets) await run.write(`faucet:fund:${asset.symbol}`, asset.testToken, 'MockERC20Decimals', 'transfer', [verified.faucet, (asset.isEquity ? 100000n : 500000n) * 10n ** BigInt(asset.decimals)]);
  await run.write('faucet:configure', verified.faucet, 'ConfigurableTokenFaucet', 'setTokens', [manifest.assets.map(asset => asset.testToken), manifest.assets.map(asset => (asset.isEquity ? 25n : 10000n) * 10n ** BigInt(asset.decimals))]);
  await run.write('ownership:faucet', verified.faucet, 'ConfigurableTokenFaucet', 'transferOwnership', [manifest.contracts.Timelock.address]);
  console.log(broadcast ? 'Faucet activated. Pool activation status and all source/session guards are unchanged.' : `Prepared ${run.plan.length} faucet-only steps without loading a key, signing, or broadcasting.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(String(error.shortMessage ?? error.message ?? 'Faucet activation failed').replace(/0x[0-9a-fA-F]{64}/g, '<redacted>').replace(/https?:\/\/[^\s)]+/g, '<rpc>').slice(0, 600)); process.exitCode = 1; });
