#!/usr/bin/env node
/** Publish only a completed deployment independently verified against the reviewed Base alpha recipe.
 * The local manifest is an index, not a trust root. All RPC operations are reads. This checks
 * deployment integrity, not live oracle availability or the safety of real-money use.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createPublicClient, http, keccak256, getAddress, getContractAddress, encodeDeployData,
  encodeFunctionData, parseEventLogs, toHex, zeroAddress, zeroHash,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { assertRuntimeMatches, linkBytecode } from './deploy-base-sepolia.mjs';
import { STOCKS, USDC } from '../services/base-market-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EXPECTED_DEPLOYER = '0xA437345Be29EC6802024A8e090E34b621b92E5E2';
export const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
function address(value, label) {
  assert(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value), `${label}: invalid address`);
  assert(!same(value, zeroAddress), `${label}: zero address`);
  return getAddress(value);
}
function hash(value, label) {
  assert(typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value), `${label}: invalid hash`);
  return value;
}
function equal(actual, expected, label) {
  if (typeof expected === 'string' && expected.startsWith('0x')) assert(same(actual, expected), `${label}: mismatch`);
  else assert.deepEqual(actual, expected, `${label}: mismatch`);
}
export function loadReviewedArtifact(name) {
  assert(/^[A-Za-z0-9_]+$/.test(name), 'Invalid reviewed artifact name');
  const artifact = JSON.parse(readFileSync(resolve(ROOT, `contracts/out/${name}.sol/${name}.json`), 'utf8'));
  assert(artifact.metadata?.sources && Object.keys(artifact.metadata.sources).length, `${name}: source metadata missing`);
  for (const [source, metadata] of Object.entries(artifact.metadata.sources)) {
    assert.equal(keccak256(readFileSync(resolve(ROOT, 'contracts', source))), metadata.keccak256, `${name}: stale artifact; rebuild first`);
  }
  return artifact;
}

/** Derive all constructor arguments from reviewed policy, never from manifest-supplied arguments. */
export function reviewedDeploymentPlan(manifest, modules, artifactFor, scope = 'protocol') {
  assert(['protocol', 'faucet', 'prepare-faucet'].includes(scope), 'Invalid verification scope');
  assert.equal(manifest.schemaVersion, 1, 'Unsupported manifest schema');
  assert.equal(manifest.chainId, 84532, 'Wrong manifest destination');
  assert.equal(manifest.sourceChainId, 8453, 'Wrong manifest source');
  if (scope === 'protocol') assert.equal(manifest.status, 'complete', 'Public deployment is not complete');
  else assert(['awaiting-live-session', 'complete'].includes(manifest.status), 'Infrastructure deployment is not ready');
  equal(manifest.deployer, EXPECTED_DEPLOYER, 'Dedicated deployer');
  assert(manifest.contracts && manifest.transactions, 'Deployment evidence missing');
  const c = name => address(manifest.contracts[name]?.address, name);
  const entries = new Map();
  function add(name, artifact = name, args = []) {
    if (entries.has(name)) return;
    entries.set(name, { name, artifact, address: c(name), args });
    for (const libraries of Object.values(artifactFor(artifact).bytecode.linkReferences || {})) {
      for (const library of Object.keys(libraries)) add(library);
    }
  }
  add('Timelock', 'YSTimelockController', [172800n, [], [], EXPECTED_DEPLOYER]);
  add('YSToken', 'YSToken', [EXPECTED_DEPLOYER]);
  add('Governor', 'YSGovernor', [c('YSToken'), c('Timelock'), EXPECTED_DEPLOYER]);
  for (const original of ['SplitRiskPool', 'SplitRiskPoolFactory']) {
    const config = modules[original];
    assert(config?.router && config.modules && config.selectors, `${original}: module policy missing`);
    for (const group of Object.values(config.modules)) add(group.contract);
    add(config.router, config.router, Object.values(config.modules).map(group => c(group.contract)));
  }
  const init = encodeFunctionData({ abi: artifactFor('SplitRiskPoolFactory').abi, functionName: 'initialize',
    args: [EXPECTED_DEPLOYER, c('Timelock'), c(modules.SplitRiskPool.router)] });
  add('Factory', 'ERC1967Proxy', [c(modules.SplitRiskPoolFactory.router), init]);
  add('BaseSepoliaStockRegistry', 'BaseSepoliaStockRegistry', [EXPECTED_DEPLOYER, EXPECTED_DEPLOYER]);
  add('USMarketSessionGate', 'USMarketSessionGate', [EXPECTED_DEPLOYER, EXPECTED_DEPLOYER]);
  add('ChainlinkOracleFeed', 'ChainlinkOracleFeed', [86400n]);
  add('CoinbaseStockOracleFeed', 'CoinbaseStockOracleFeed', [c('ChainlinkOracleFeed'), c('USMarketSessionGate'), c('BaseSepoliaStockRegistry')]);
  add('CompositeOracle');
  add('ERC4626OracleFeed', 'ERC4626OracleFeed', [c('ChainlinkOracleFeed')]);
  add('Faucet', 'ConfigurableTokenFaucet', [EXPECTED_DEPLOYER]);
  assert(Array.isArray(manifest.assets) && manifest.assets.length === 5, 'Expected five distinct source assets');
  const assets = [...STOCKS, USDC].map(source => {
    const matches = manifest.assets.filter(asset => asset.sourceSymbol === source.symbol);
    assert.equal(matches.length, 1, `${source.symbol}: missing or duplicate asset`);
    const asset = matches[0], equity = source.symbol !== 'USDC';
    const symbol = equity ? `t${source.symbol}` : 'TestUSDC', decimals = equity ? 8 : 6;
    equal(asset.sourceToken, source.token, `${symbol}: source token`);
    equal(asset.sourceFeed, source.feed, `${symbol}: source feed`);
    equal(asset.testToken, c(`Token:${source.symbol}`), `${symbol}: test token`);
    equal(asset.aggregator, c(`Aggregator:${source.symbol}`), `${symbol}: aggregator`);
    equal(asset.symbol, symbol, `${symbol}: symbol`);
    equal(asset.decimals, decimals, `${symbol}: decimals`);
    equal(asset.isEquity, equity, `${symbol}: equity flag`);
    const name = `Test ${source.name} (Base Sepolia)`;
    equal(asset.name, name, `${symbol}: name`);
    add(`Token:${source.symbol}`, 'MockERC20Decimals', [name, symbol, decimals]);
    add(`Aggregator:${source.symbol}`, 'BaseSepoliaStockAggregator', [c('BaseSepoliaStockRegistry'), asset.testToken]);
    return { ...asset, symbol, decimals, isEquity: equity };
  });
  assert.equal(new Set([...entries.values()].map(entry => entry.address.toLowerCase())).size, entries.size, 'Duplicate contract addresses');
  assert.deepEqual(Object.keys(manifest.contracts).sort(), [...entries.keys()].sort(), 'Unexpected or missing deployment contracts');
  assert(Array.isArray(manifest.pools) && manifest.pools.length <= 4, 'Invalid stock pool inventory');
  if (scope === 'protocol' || manifest.status === 'complete') assert.equal(manifest.pools.length, 4, 'Expected four stock pools');
  const backing = assets.find(asset => !asset.isEquity);
  const pools = assets.filter(asset => asset.isEquity).flatMap(asset => {
    const matches = manifest.pools.filter(pool => pool.symbol === asset.symbol);
    if (scope !== 'protocol' && manifest.status !== 'complete' && matches.length === 0) return [];
    assert.equal(matches.length, 1, `${asset.symbol}: missing or duplicate pool`);
    const pool = matches[0];
    address(pool.address, `${asset.symbol}: pool`);
    equal(pool.shieldedToken, asset.testToken, `${asset.symbol}: pool stock`);
    equal(pool.backingToken, backing.testToken, `${asset.symbol}: pool backing`);
    return [pool];
  });
  assert.equal(pools.length, manifest.pools.length, 'Unknown pool in inventory');
  const poolAddresses = pools.map(pool => pool.address.toLowerCase());
  assert.equal(new Set(poolAddresses).size, pools.length, 'Duplicate pool addresses');
  assert(poolAddresses.every(pool => ![...entries.values()].some(entry => same(entry.address, pool))), 'Pool reuses a core contract address');
  return { entries: [...entries.values()], assets, pools, backing };
}

/** Read-only verification with injectable artifacts/client for isolated regression tests. */
async function verifyReviewedDeployment({ manifest, client, modules, artifactFor = loadReviewedArtifact }, scope) {
  const cache = new Map();
  const a = name => { if (!cache.has(name)) cache.set(name, artifactFor(name)); return cache.get(name); };
  const plan = reviewedDeploymentPlan(manifest, modules, a, scope);
  equal(await client.getChainId(), 84532, 'Destination RPC');
  const block = await client.getBlock({ blockTag: 'latest' });
  assert(typeof block.number === 'bigint' && block.number > 1n, 'Invalid verification block');
  hash(block.hash, 'Verification block');
  const blockNumber = block.number;
  const c = name => address(manifest.contracts[name]?.address, name);
  const read = (addr, name, functionName, args = []) => client.readContract({ address: addr, abi: a(name).abi, functionName, args, blockNumber });
  const expect = async (addr, name, method, args, expected) => equal(await read(addr, name, method, args), expected, `${name}.${method}`);
  const links = {};
  for (const entry of plan.entries) for (const [file, libraries] of Object.entries(a(entry.artifact).bytecode.linkReferences || {})) {
    for (const name of Object.keys(libraries)) links[`${file}:${name}`] = c(name);
  }
  const transactions = new Set();
  async function verifyTransaction(id, expectedData, target, contractAddress) {
    const saved = manifest.transactions[id];
    assert(saved?.status === 'confirmed' && saved.receipt, `${id}: missing confirmed transaction`);
    hash(saved.hash, `${id}: transaction`);
    assert(!transactions.has(saved.hash), `${id}: reused transaction hash`); transactions.add(saved.hash);
    const [receipt, transaction] = await Promise.all([
      client.getTransactionReceipt({ hash: saved.hash }), client.getTransaction({ hash: saved.hash }),
    ]);
    equal(receipt.transactionHash, saved.hash, `${id}: receipt transaction hash`);
    equal(saved.receipt.transactionHash, saved.hash, `${id}: saved receipt identity`);
    equal(transaction.hash, saved.hash, `${id}: transaction identity`);
    equal(receipt.status, 'success', `${id}: receipt status`);
    equal(receipt.blockHash, saved.receipt.blockHash, `${id}: saved block hash`);
    equal(transaction.blockHash, receipt.blockHash, `${id}: transaction block`);
    equal(BigInt(saved.receipt.blockNumber), receipt.blockNumber, `${id}: saved block number`);
    assert(receipt.blockNumber < blockNumber, `${id}: two confirmations required`);
    equal(transaction.from, EXPECTED_DEPLOYER, `${id}: sender`);
    equal(transaction.chainId, 84532, `${id}: chain`);
    equal(transaction.value, 0n, `${id}: value`);
    equal(transaction.input, expectedData, `${id}: reviewed transaction calldata`);
    if (target) equal(transaction.to, target, `${id}: target`);
    else {
      equal(transaction.to, null, `${id}: creation target`);
      equal(receipt.contractAddress, contractAddress, `${id}: created address`);
      equal(getContractAddress({ from: EXPECTED_DEPLOYER, nonce: BigInt(transaction.nonce) }), contractAddress, `${id}: CREATE address`);
    }
    return receipt;
  }
  let factoryReceipt;
  for (const entry of plan.entries) {
    const artifact = a(entry.artifact), record = manifest.contracts[entry.name];
    equal(record.artifact, entry.artifact, `${entry.name}: artifact identity`);
    equal(record.txHash, manifest.transactions[`deploy:${entry.name}`]?.hash, `${entry.name}: deployment transaction`);
    const data = encodeDeployData({ abi: artifact.abi, bytecode: linkBytecode(artifact.bytecode.object, artifact.bytecode.linkReferences, links), args: entry.args });
    const receipt = await verifyTransaction(`deploy:${entry.name}`, data, null, entry.address);
    const code = await client.getCode({ address: entry.address, blockNumber });
    assert(code && code !== '0x', `${entry.name}: missing runtime`);
    assertRuntimeMatches(artifact, code, entry.address, links);
    // Manifest hashes may detect corruption, but the independent artifact/input checks above are authoritative.
    equal(keccak256(code), record.runtimeCodehash, `${entry.name}: recorded runtime hash`);
    if (entry.name === 'Factory') factoryReceipt = receipt;
  }
  async function implementation(proxy, expected) {
    const slot = await client.getStorageAt({ address: proxy, slot: IMPLEMENTATION_SLOT, blockNumber });
    assert(/^0x[0-9a-fA-F]{64}$/.test(slot || ''), 'Malformed proxy implementation slot');
    equal('0x' + slot.slice(-40), expected, 'Proxy implementation');
  }
  for (const config of Object.values(modules)) {
    for (const [groupName, group] of Object.entries(config.modules)) {
      await expect(c(config.router), config.router, `${groupName.toLowerCase()}Module`, [], c(group.contract));
      for (const [signature, selector] of Object.entries(config.selectors)) {
        if (group.entryPoints.includes(signature.slice(0, signature.indexOf('('))) && !['proxiableUUID()', 'upgradeToAndCall(address,bytes)'].includes(signature)) {
          await expect(c(config.router), config.router, 'moduleForSelector', ['0x' + selector], c(group.contract));
        }
      }
    }
  }
  const factory = c('Factory'), timelock = c('Timelock'), composite = c('CompositeOracle');
  const inner = c('ChainlinkOracleFeed'), wrapper = c('CoinbaseStockOracleFeed'), relay = c('BaseSepoliaStockRegistry');
  await implementation(factory, c(modules.SplitRiskPoolFactory.router));
  for (const [name, owner] of [['Factory', timelock], ['CompositeOracle', factory], ['ERC4626OracleFeed', factory],
    ['ChainlinkOracleFeed', timelock], ['CoinbaseStockOracleFeed', timelock], ['BaseSepoliaStockRegistry', timelock],
    ['USMarketSessionGate', timelock], ['Faucet', timelock]]) {
    if (name === 'Faucet' && scope === 'prepare-faucet') {
      const currentOwner = await read(c(name), 'ConfigurableTokenFaucet', 'owner');
      assert(same(currentOwner, timelock) || same(currentOwner, EXPECTED_DEPLOYER), 'Unexpected faucet owner');
    } else await expect(c(name), name === 'Factory' ? 'SplitRiskPoolFactory' : name === 'Faucet' ? 'ConfigurableTokenFaucet' : name, 'owner', [], owner);
  }
  for (const [method, value] of Object.entries({ bootstrapModeEnabled: false, governanceTimelock: timelock,
    pendingGovernanceTimelock: zeroAddress, compositeOracle: composite, splitRiskPoolImplementation: c(modules.SplitRiskPool.router),
    defaultProtocolFeeRecipient: timelock, erc4626OracleFeed: c('ERC4626OracleFeed') })) {
    await expect(factory, 'SplitRiskPoolFactory', method, [], value);
  }
  await expect(factory, 'SplitRiskPoolFactory', 'poolImplementationCodehash', [], keccak256(await client.getCode({ address: c(modules.SplitRiskPool.router), blockNumber })));
  await expect(composite, 'CompositeOracle', 'authorizedCallerCount', [], 0n);
  await expect(composite, 'CompositeOracle', 'robinhoodStockOracleFeed', [], wrapper);
  await expect(c('Governor'), 'YSGovernor', 'timelock', [], timelock);
  await expect(c('Governor'), 'YSGovernor', 'token', [], c('YSToken'));
  await expect(timelock, 'YSTimelockController', 'getMinDelay', [], 172800n);
  for (const role of [zeroHash, ...['PROPOSER_ROLE', 'EXECUTOR_ROLE', 'CANCELLER_ROLE'].map(name => keccak256(toHex(name)))]) {
    await expect(timelock, 'YSTimelockController', 'getRoleMemberCount', [role], 1n);
    await expect(timelock, 'YSTimelockController', 'getRoleMember', [role, 0n], role === zeroHash ? timelock : c('Governor'));
  }
  await expect(relay, 'BaseSepoliaStockRegistry', 'operator', [], EXPECTED_DEPLOYER);
  await expect(c('USMarketSessionGate'), 'USMarketSessionGate', 'emergencyGuardian', [], EXPECTED_DEPLOYER);
  for (const [method, value] of [['innerFeed', inner], ['marketSessionGate', c('USMarketSessionGate')], ['oracleRegistry', relay]]) {
    await expect(wrapper, 'CoinbaseStockOracleFeed', method, [], value);
  }
  for (const name of ['ChainlinkOracleFeed', 'ERC4626OracleFeed']) {
    await expect(c(name), name, 'sequencerUptimeFeed', [], relay);
    await expect(c(name), name, 'sequencerUptimeFeedRequired', [], true);
  }
  await expect(c('ERC4626OracleFeed'), 'ERC4626OracleFeed', 'underlyingPriceOracle', [], inner);
  if (scope !== 'prepare-faucet') await expect(c('Faucet'), 'ConfigurableTokenFaucet', 'getAllTokens', [], plan.assets.map(asset => getAddress(asset.testToken)));
  for (const asset of plan.assets) {
    const token = getAddress(asset.testToken), aggregator = getAddress(asset.aggregator);
    for (const [method, value] of [['owner', timelock], ['decimals', asset.decimals], ['symbol', asset.symbol], ['name', asset.name]]) {
      await expect(token, 'MockERC20Decimals', method, [], value);
    }
    equal(await read(relay, 'BaseSepoliaStockRegistry', 'tokenConfigs', [token]), [getAddress(asset.sourceToken), getAddress(asset.sourceFeed), asset.isEquity], `${asset.symbol}: permanent source identity`);
    await expect(relay, 'BaseSepoliaStockRegistry', 'testTokensBySource', [asset.sourceToken], token);
    for (const [method, value] of [['registry', relay], ['testToken', token], ['sourceToken', asset.sourceToken], ['sourceFeed', asset.sourceFeed], ['isEquity', asset.isEquity], ['decimals', 8]]) {
      await expect(aggregator, 'BaseSepoliaStockAggregator', method, [], value);
    }
    await expect(inner, 'ChainlinkOracleFeed', 'tokenFeeds', [token], aggregator);
    await expect(factory, 'SplitRiskPoolFactory', 'isWhitelisted', [token], true);
    await expect(composite, 'CompositeOracle', 'getTokenOracleFeed', [token], asset.isEquity ? wrapper : inner);
    equal(await read(composite, 'CompositeOracle', 'getTokenDualFeedStatus', [token]), [false, asset.isEquity ? wrapper : inner, zeroAddress, false, false, 0n], `${asset.symbol}: oracle route`);
    if (asset.isEquity) {
      await expect(wrapper, 'CoinbaseStockOracleFeed', 'isTokenConfigured', [token], true);
      await expect(inner, 'ChainlinkOracleFeed', 'protectionOpeningMaxPriceAgeForToken', [token], 3600n);
      await expect(composite, 'CompositeOracle', 'protectionOpeningEligibilityRequired', [token], true);
    } else {
      await expect(factory, 'SplitRiskPoolFactory', 'tokenRequiresStrictProtectedPrice', [token], true);
      await expect(composite, 'CompositeOracle', 'strictCircuitBreakerRequired', [token], true);
      await expect(composite, 'CompositeOracle', 'supportsStrictProtectedPrice', [token], true);
    }
    if (scope !== 'prepare-faucet') {
      const drip = (asset.isEquity ? 25n : 10000n) * 10n ** BigInt(asset.decimals);
      await expect(c('Faucet'), 'ConfigurableTokenFaucet', 'enabledTokens', [token], true);
      await expect(c('Faucet'), 'ConfigurableTokenFaucet', 'dripAmount', [token], drip);
      if (scope === 'faucet') assert(await read(token, 'MockERC20Decimals', 'balanceOf', [c('Faucet')]) >= drip, `${asset.symbol}: faucet needs funding`);
    }
  }
  const nfts = new Set();
  for (const pool of plan.pools) {
    const poolAddress = getAddress(pool.address);
    const createData = encodeFunctionData({ abi: a('SplitRiskPoolFactory').abi, functionName: 'createPool',
      args: [pool.shieldedToken, pool.symbol, pool.backingToken, 'TestUSDC', 1000n, 100n, 15000n, 1000n * 10n ** 6n] });
    const receipt = await verifyTransaction(`pool:create:${pool.symbol}`, createData, factory);
    const events = parseEventLogs({ abi: a('SplitRiskPoolFactory').abi, logs: receipt.logs, eventName: 'PoolCreated', strict: true }).filter(log => same(log.address, factory));
    assert.equal(events.length, 1, `${pool.symbol}: expected one factory creation event`);
    for (const [field, expected] of Object.entries({ poolAddress, shieldedToken: pool.shieldedToken, backingToken: pool.backingToken, creator: EXPECTED_DEPLOYER })) equal(events[0].args[field], expected, `${pool.symbol}: creation event ${field}`);
    const code = await client.getCode({ address: poolAddress, blockNumber });
    assertRuntimeMatches(a('ERC1967Proxy'), code, poolAddress, links);
    await implementation(poolAddress, c(modules.SplitRiskPool.router));
    await expect(factory, 'SplitRiskPoolFactory', 'isPoolActive', [poolAddress], true);
    for (const [method, value] of Object.entries({ POOL_FACTORY: factory, owner: factory, governanceTimelock: timelock,
      SHIELDED_TOKEN: pool.shieldedToken, BACKING_TOKEN: pool.backingToken, POOL_CREATOR: EXPECTED_DEPLOYER,
      COMMISSION_RATE: 1000n, POOL_FEE: 100n, COLLATERAL_RATIO: 15000n, requiresStrictProtectedBackingPrice: true,
      accessControl: zeroAddress, hasEverLaunched: true })) await expect(poolAddress, 'SplitRiskPool', method, [], value);
    equal(await read(poolAddress, 'SplitRiskPool', 'getOracleInfo'), [composite, false, wrapper, zeroAddress, false], `${pool.symbol}: pool oracle wiring`);
    for (const [method, artifact] of [['shieldReceiptNFT', 'ShieldReceiptNFT'], ['protectorReceiptNFT', 'ProtectorReceiptNFT']]) {
      const nft = address(await read(poolAddress, 'SplitRiskPool', method), `${pool.symbol}: ${method}`);
      assert(!nfts.has(nft.toLowerCase()) && !plan.entries.some(entry => same(entry.address, nft)) && !plan.pools.some(entry => same(entry.address, nft)), 'NFT address reused'); nfts.add(nft.toLowerCase());
      assertRuntimeMatches(a(artifact), await client.getCode({ address: nft, blockNumber }), nft, links);
      await expect(nft, artifact, 'pool', [], poolAddress);
      await expect(nft, artifact, 'owner', [], poolAddress);
    }
  }
  // Configuration and runtime reads must come from the same still-canonical block.
  equal((await client.getBlock({ blockNumber })).hash, block.hash, 'Verification block reorged');
  return { factory, compositeOracle: composite, faucet: c('Faucet'), deploymentBlock: factoryReceipt.blockNumber, verifiedBlock: blockNumber };
}

/** Protocol addresses still require every pool to be complete and independently verified. */
export function verifyBaseDeployment(verification) {
  return verifyReviewedDeployment(verification, 'protocol');
}

/** Before dispensing, verify reviewed runtimes, source identities and finalized governance. */
export async function verifyBaseFaucetPreparation(verification) {
  const result = await verifyReviewedDeployment(verification, 'prepare-faucet');
  return { faucet: result.faucet, verifiedBlock: result.verifiedBlock };
}

/** Faucet publication exposes no factory, oracle, or pool addresses. */
export async function verifyBaseFaucet(verification) {
  const result = await verifyReviewedDeployment(verification, 'faucet');
  return { faucet: result.faucet, verifiedBlock: result.verifiedBlock };
}

export async function publishBaseFaucet({ outputPath, ...verification }) {
  const result = await verifyBaseFaucet(verification);
  const contents = `// Generated after independent Base Sepolia faucet and governance verification.\nimport type { Address } from "viem";\nexport const FAUCET_DEPLOYMENTS: Readonly<Record<number, Address>> = {\n  84532: "${result.faucet}",\n};\n`;
  const temporary = `${outputPath}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, contents, { flag: 'wx' }); renameSync(temporary, outputPath); }
  catch (error) { try { unlinkSync(temporary); } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') throw cleanupError; } throw error; }
  return result;
}

export async function publishBaseDeployment({ outputPath, ...verification }) {
  const deployment = await verifyBaseDeployment(verification);
  const contents = `// Generated from a completed Base Sepolia deployment after artifact and onchain configuration verification.\nimport type { Address } from "viem";\nexport type EvmDeployment = { factory: Address; compositeOracle: Address; faucet?: Address; deploymentBlock?: bigint };\nexport const DEPLOYMENTS: Record<number, EvmDeployment> = {\n  84532: {\n    factory: "${deployment.factory}",\n    compositeOracle: "${deployment.compositeOracle}",\n    faucet: "${deployment.faucet}",\n    deploymentBlock: ${deployment.deploymentBlock}n,\n  },\n};\n`;
  const temporary = `${outputPath}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, contents, { flag: 'wx' }); renameSync(temporary, outputPath); }
  catch (error) {
    try { unlinkSync(temporary); }
    catch (cleanupError) { if (cleanupError.code !== 'ENOENT') throw new AggregateError([error, cleanupError], 'Publication and temporary-file cleanup failed'); }
    throw error;
  }
  return deployment;
}

export async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node scripts/sync-base-deployment.mjs');
  // Reuse the independent selector/storage/source verifier before trusting generated module artifacts.
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/verify-base-modules.mjs')], { cwd: ROOT, stdio: 'inherit' });
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'contracts/deployments/base-sepolia-alpha.json'), 'utf8'));
  const modules = JSON.parse(readFileSync(resolve(ROOT, 'contracts/config/base-modules.json'), 'utf8'));
  const client = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org') });
  await publishBaseDeployment({ manifest, modules, client, outputPath: resolve(ROOT, 'packages/adapter-evm/src/deployments.ts') });
  console.log('Published verified Base Sepolia frontend entrypoints. Rebuild and deploy the frontend to activate them.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
