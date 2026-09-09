import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAddress, getContractAddress, keccak256, toHex, parseAbi, encodeDeployData, encodeFunctionData,
  encodeEventTopics, encodeAbiParameters, parseAbiParameters, zeroAddress, zeroHash } from 'viem';
import { EXPECTED_DEPLOYER, IMPLEMENTATION_SLOT, reviewedDeploymentPlan, verifyBaseDeployment, publishBaseDeployment, verifyBaseFaucetPreparation, verifyBaseFaucet, publishBaseFaucet } from './sync-base-deployment.mjs';
import { linkBytecode } from './deploy-base-sepolia.mjs';
import { STOCKS, USDC } from '../services/base-market-data.mjs';

const modules = JSON.parse(readFileSync(new URL('../contracts/config/base-modules.json', import.meta.url), 'utf8'));
const blockHash = '0x' + '11'.repeat(32), receiptBlockHash = '0x' + '22'.repeat(32);
const constructors = {
  YSTimelockController: 'constructor(uint256,address[],address[],address)', YSToken: 'constructor(address)',
  YSGovernor: 'constructor(address,address,address)', ERC1967Proxy: 'constructor(address,bytes)',
  BaseSepoliaStockRegistry: 'constructor(address,address)', USMarketSessionGate: 'constructor(address,address)',
  ChainlinkOracleFeed: 'constructor(uint256)', CoinbaseStockOracleFeed: 'constructor(address,address,address)',
  ERC4626OracleFeed: 'constructor(address)', ConfigurableTokenFaucet: 'constructor(address)',
  MockERC20Decimals: 'constructor(string,string,uint8)', BaseSepoliaStockAggregator: 'constructor(address,address)',
  BasePoolRouter: 'constructor(address,address,address,address,address,address,address,address)',
  BaseFactoryRouter: 'constructor(address,address,address,address,address)',
};
const factoryAbi = parseAbi([
  'function initialize(address,address,address)',
  'function createPool(address,string,address,string,uint256,uint256,uint256,uint256)',
  'event PoolCreated(address indexed poolAddress,address indexed shieldedToken,address indexed backingToken,uint256 commissionRate,uint256 poolFee,uint256 collateralRatio,address creator)',
]);
const key = (address, method, args = []) => JSON.stringify([address.toLowerCase(), method, args], (_, value) => typeof value === 'bigint' ? String(value) : typeof value === 'string' && value.startsWith('0x') ? value.toLowerCase() : value);

/** Synthetic compiler artifacts and an independent read-only chain model: no RPC, keys or deployment. */
function fixture() {
  const artifacts = new Map();
  function artifactFor(name) {
    if (!artifacts.has(name)) {
      const suffix = (artifacts.size + 1).toString(16).padStart(2, '0');
      const linked = name === 'BaseFactoryCreateModule';
      const object = linked ? '0x60' + '00'.repeat(20) + suffix : '0x60' + suffix + '00';
      const linkReferences = linked ? { 'contracts/libraries/PoolCreationLib.sol': { PoolCreationLib: [{ start: 1, length: 20 }] } } : {};
      artifacts.set(name, { abi: name === 'SplitRiskPoolFactory' ? factoryAbi : constructors[name] ? parseAbi([constructors[name]]) : [],
        bytecode: { object, linkReferences }, deployedBytecode: { object, linkReferences, immutableReferences: {} } });
    }
    return artifacts.get(name);
  }
  const names = ['Timelock', 'YSToken', 'Governor', 'Factory', 'BaseSepoliaStockRegistry', 'USMarketSessionGate',
    'ChainlinkOracleFeed', 'CoinbaseStockOracleFeed', 'CompositeOracle', 'ERC4626OracleFeed', 'Faucet', 'PoolCreationLib',
    ...Object.values(modules).flatMap(config => [config.router, ...Object.values(config.modules).map(group => group.contract)]),
    ...[...STOCKS, USDC].flatMap(asset => [`Token:${asset.symbol}`, `Aggregator:${asset.symbol}`])];
  const manifest = { schemaVersion: 1, chainId: 84532, sourceChainId: 8453, status: 'complete', deployer: EXPECTED_DEPLOYER, contracts: {}, transactions: {}, assets: [], pools: [] };
  const nonceByName = new Map();
  for (const [nonce, name] of names.entries()) {
    nonceByName.set(name, nonce);
    manifest.contracts[name] = { address: getContractAddress({ from: EXPECTED_DEPLOYER, nonce: BigInt(nonce) }) };
  }
  const c = name => getAddress(manifest.contracts[name].address);
  for (const source of [...STOCKS, USDC]) {
    const equity = source.symbol !== 'USDC';
    manifest.assets.push({ sourceSymbol: source.symbol, sourceToken: source.token, sourceFeed: source.feed,
      symbol: equity ? `t${source.symbol}` : 'TestUSDC', decimals: equity ? 8 : 6, isEquity: equity,
      name: `Test ${source.name} (Base Sepolia)`, testToken: c(`Token:${source.symbol}`), aggregator: c(`Aggregator:${source.symbol}`) });
  }
  const arbitraryAddress = n => getAddress('0x' + n.toString(16).padStart(40, '0'));
  for (const [index, asset] of manifest.assets.filter(asset => asset.isEquity).entries()) manifest.pools.push({ symbol: asset.symbol, address: arbitraryAddress(1000 + index), shieldedToken: asset.testToken, backingToken: c('Token:USDC') });
  const plan = reviewedDeploymentPlan(manifest, modules, artifactFor);
  const codes = new Map(), transactions = new Map(), receipts = new Map(), reads = new Map(), storage = new Map();
  const links = { 'contracts/libraries/PoolCreationLib.sol:PoolCreationLib': c('PoolCreationLib') };
  function saveTransaction(id, input, target, created, nonce, logs = []) {
    const hash = keccak256(toHex(id));
    const receipt = { transactionHash: hash, status: 'success', blockHash: receiptBlockHash, blockNumber: 100n, contractAddress: created, logs };
    const transaction = { hash, from: EXPECTED_DEPLOYER, to: target, nonce, chainId: 84532, value: 0n, input, blockHash: receiptBlockHash };
    manifest.transactions[id] = { status: 'confirmed', hash, receipt: { ...receipt, blockNumber: '100' } };
    transactions.set(hash, transaction); receipts.set(hash, receipt);
    return hash;
  }
  for (const entry of plan.entries) {
    const artifact = artifactFor(entry.artifact);
    const input = encodeDeployData({ abi: artifact.abi, bytecode: linkBytecode(artifact.bytecode.object, artifact.bytecode.linkReferences, links), args: entry.args });
    const code = linkBytecode(artifact.deployedBytecode.object, artifact.deployedBytecode.linkReferences, links);
    const txHash = saveTransaction(`deploy:${entry.name}`, input, null, entry.address, nonceByName.get(entry.name));
    Object.assign(manifest.contracts[entry.name], { txHash, artifact: entry.artifact, runtimeCodehash: keccak256(code), constructorArguments: entry.args });
    codes.set(entry.address.toLowerCase(), code);
  }
  const set = (addr, method, args, value) => reads.set(key(addr, method, args), value);
  const setFields = (addr, fields) => { for (const [method, value] of Object.entries(fields)) set(addr, method, [], value); };
  const setImplementation = (proxy, implementation) => storage.set(proxy.toLowerCase(), '0x' + '00'.repeat(12) + implementation.slice(2));
  for (const config of Object.values(modules)) for (const [groupName, group] of Object.entries(config.modules)) {
    set(c(config.router), ({ PartialExit: "partialexitModule", ShieldExit: "shieldexitModule" }[groupName] ?? `${groupName.toLowerCase()}Module`), [], c(group.contract));
    for (const [signature, selector] of Object.entries(config.selectors)) if (group.entryPoints.includes(signature.split('(')[0])) set(c(config.router), 'moduleForSelector', ['0x' + selector], c(group.contract));
  }
  const factory = c('Factory'), timelock = c('Timelock'), composite = c('CompositeOracle'), wrapper = c('CoinbaseStockOracleFeed'), inner = c('ChainlinkOracleFeed'), relay = c('BaseSepoliaStockRegistry');
  setImplementation(factory, c('BaseFactoryRouter'));
  setFields(factory, { owner: timelock, bootstrapModeEnabled: false, governanceTimelock: timelock, pendingGovernanceTimelock: zeroAddress,
    compositeOracle: composite, splitRiskPoolImplementation: c('BasePoolRouter'), defaultProtocolFeeRecipient: timelock,
    erc4626OracleFeed: c('ERC4626OracleFeed'), poolImplementationCodehash: keccak256(codes.get(c('BasePoolRouter').toLowerCase())) });
  setFields(composite, { owner: factory, authorizedCallerCount: 0n, robinhoodStockOracleFeed: wrapper });
  setFields(c('ERC4626OracleFeed'), { owner: factory, underlyingPriceOracle: inner, sequencerUptimeFeed: relay, sequencerUptimeFeedRequired: true });
  setFields(inner, { owner: timelock, sequencerUptimeFeed: relay, sequencerUptimeFeedRequired: true });
  setFields(wrapper, { owner: timelock, innerFeed: inner, marketSessionGate: c('USMarketSessionGate'), oracleRegistry: relay });
  setFields(relay, { owner: timelock, operator: EXPECTED_DEPLOYER });
  setFields(c('USMarketSessionGate'), { owner: timelock, emergencyGuardian: EXPECTED_DEPLOYER });
  setFields(c('Faucet'), { owner: timelock, getAllTokens: manifest.assets.map(asset => getAddress(asset.testToken)) });
  setFields(c('Governor'), { token: c('YSToken'), timelock });
  setFields(timelock, { getMinDelay: 172800n });
  for (const role of [zeroHash, ...['PROPOSER_ROLE', 'EXECUTOR_ROLE', 'CANCELLER_ROLE'].map(name => keccak256(toHex(name)))]) {
    set(timelock, 'getRoleMemberCount', [role], 1n); set(timelock, 'getRoleMember', [role, 0n], role === zeroHash ? timelock : c('Governor'));
  }
  for (const asset of manifest.assets) {
    const token = getAddress(asset.testToken);
    setFields(token, { owner: timelock, decimals: asset.decimals, symbol: asset.symbol, name: asset.name });
    set(relay, 'tokenConfigs', [token], [getAddress(asset.sourceToken), getAddress(asset.sourceFeed), asset.isEquity]);
    set(relay, 'testTokensBySource', [asset.sourceToken], token);
    setFields(asset.aggregator, { registry: relay, testToken: token, sourceToken: asset.sourceToken, sourceFeed: asset.sourceFeed, isEquity: asset.isEquity, decimals: 8 });
    set(inner, 'tokenFeeds', [token], asset.aggregator);
    set(factory, 'isWhitelisted', [token], true);
    set(composite, 'getTokenOracleFeed', [token], asset.isEquity ? wrapper : inner);
    set(composite, 'getTokenDualFeedStatus', [token], [false, asset.isEquity ? wrapper : inner, zeroAddress, false, false, 0n]);
    if (asset.isEquity) {
      set(wrapper, 'isTokenConfigured', [token], true); set(inner, 'protectionOpeningMaxPriceAgeForToken', [token], 3600n); set(composite, 'protectionOpeningEligibilityRequired', [token], true);
    } else {
      set(factory, 'tokenRequiresStrictProtectedPrice', [token], true); set(composite, 'strictCircuitBreakerRequired', [token], true); set(composite, 'supportsStrictProtectedPrice', [token], true);
    }
    set(c('Faucet'), 'enabledTokens', [token], true); set(c('Faucet'), 'dripAmount', [token], (asset.isEquity ? 25n : 10000n) * 10n ** BigInt(asset.decimals));
  }
  for (const [index, pool] of manifest.pools.entries()) {
    const topics = encodeEventTopics({ abi: factoryAbi, eventName: 'PoolCreated', args: { poolAddress: pool.address, shieldedToken: pool.shieldedToken, backingToken: pool.backingToken } });
    const data = encodeAbiParameters(parseAbiParameters('uint256,uint256,uint256,address'), [1000n, 100n, 15000n, EXPECTED_DEPLOYER]);
    const input = encodeFunctionData({ abi: factoryAbi, functionName: 'createPool', args: [pool.shieldedToken, pool.symbol, pool.backingToken, 'TestUSDC', 1000n, 100n, 15000n, 1000n * 10n ** 6n] });
    saveTransaction(`pool:create:${pool.symbol}`, input, factory, null, 100 + index, [{ address: factory, topics, data }]);
    codes.set(pool.address.toLowerCase(), artifactFor('ERC1967Proxy').deployedBytecode.object);
    setImplementation(pool.address, c('BasePoolRouter'));
    set(factory, 'isPoolActive', [pool.address], true);
    const shieldNFT = arbitraryAddress(2000 + index * 2), protectorNFT = arbitraryAddress(2001 + index * 2);
    setFields(pool.address, { POOL_FACTORY: factory, owner: factory, governanceTimelock: timelock, SHIELDED_TOKEN: pool.shieldedToken,
      BACKING_TOKEN: pool.backingToken, POOL_CREATOR: EXPECTED_DEPLOYER, COMMISSION_RATE: 1000n, POOL_FEE: 100n, COLLATERAL_RATIO: 15000n,
      requiresStrictProtectedBackingPrice: true, accessControl: zeroAddress, hasEverLaunched: true,
      getOracleInfo: [composite, false, wrapper, zeroAddress, false], shieldReceiptNFT: shieldNFT, protectorReceiptNFT: protectorNFT });
    for (const [nft, name] of [[shieldNFT, 'ShieldReceiptNFT'], [protectorNFT, 'ProtectorReceiptNFT']]) {
      codes.set(nft.toLowerCase(), artifactFor(name).deployedBytecode.object); setFields(nft, { pool: pool.address, owner: pool.address });
    }
  }
  let readCount = 0;
  const pinned = request => assert.equal(request.blockNumber, 200n, 'all mutable chain state must use the verification block');
  const client = {
    getChainId: async () => 84532,
    getBlock: async request => { if (request.blockNumber !== undefined) pinned(request); return { number: 200n, hash: blockHash }; },
    getTransactionReceipt: async ({ hash }) => { assert(receipts.has(hash)); return receipts.get(hash); },
    getTransaction: async ({ hash }) => { assert(transactions.has(hash)); return transactions.get(hash); },
    getCode: async request => { pinned(request); return codes.get(request.address.toLowerCase()); },
    getStorageAt: async request => { pinned(request); assert.equal(request.slot, IMPLEMENTATION_SLOT); return storage.get(request.address.toLowerCase()); },
    readContract: async request => { pinned(request); readCount++; const id = key(request.address, request.functionName, request.args); assert(reads.has(id), `unmodeled read ${id}`); return reads.get(id); },
  };
  return { manifest, client, modules, artifactFor, c, set, reads, codes, transactions, receipts, storage, get readCount() { return readCount; } };
}

test('reviewed deployment requires artifact, transaction and pinned configuration evidence', async () => {
  const f = fixture(); const verified = await verifyBaseDeployment(f);
  assert.equal(verified.factory, f.c('Factory')); assert.equal(verified.deploymentBlock, 100n); assert(f.readCount > 200);
});

test('malformed four-placeholder pool manifest is rejected without consulting the RPC', async () => {
  const f = fixture(); f.manifest.pools = [{}, {}, {}, {}]; f.client.getChainId = () => { throw Error('must reject before RPC'); };
  await assert.rejects(verifyBaseDeployment(f), /missing or duplicate pool/);
});

test('self-consistent manifest hashes do not bless arbitrary runtime code', async () => {
  const f = fixture(); const target = f.c('CompositeOracle'); f.codes.set(target.toLowerCase(), '0x6000'); f.manifest.contracts.CompositeOracle.runtimeCodehash = keccak256('0x6000');
  await assert.rejects(verifyBaseDeployment(f), /runtime length differs from artifact/);
});

test('self-consistent changed bytecode still fails comparison with reviewed logic', async () => {
  const f = fixture(); f.codes.set(f.c('Faucet').toLowerCase(), '0x60ff00'); f.manifest.contracts.Faucet.runtimeCodehash = keccak256('0x60ff00');
  await assert.rejects(verifyBaseDeployment(f), /runtime differs from reviewed artifact/);
});

test('changed constructor arguments cannot be authorized by the manifest', async () => {
  const f = fixture(); const hash = f.manifest.contracts.CoinbaseStockOracleFeed.txHash;
  f.transactions.get(hash).input += '00'; f.manifest.contracts.CoinbaseStockOracleFeed.constructorArguments = [zeroAddress, zeroAddress, zeroAddress];
  await assert.rejects(verifyBaseDeployment(f), /reviewed transaction calldata/);
});

for (const [label, mutate, expected] of [
  ['duplicate pool', f => { f.manifest.pools[1].address = f.manifest.pools[0].address; }, /Duplicate pool addresses/],
  ['mainnet asset substituted for mock', f => { f.manifest.assets[0].testToken = STOCKS[0].token; }, /test token/],
  ['wrong source feed', f => { f.manifest.assets[0].sourceFeed = STOCKS[1].feed; }, /source feed/],
  ['wrong deployer', f => { f.manifest.deployer = zeroAddress; }, /Dedicated deployer/],
  ['bootstrap still open', f => f.set(f.c('Factory'), 'bootstrapModeEnabled', [], true), /bootstrapModeEnabled/],
  ['unmanaged factory owner', f => f.set(f.c('Factory'), 'owner', [], EXPECTED_DEPLOYER), /owner/],
  ['extra timelock executor', f => f.set(f.c('Timelock'), 'getRoleMemberCount', [keccak256(toHex('EXECUTOR_ROLE'))], 2n), /getRoleMemberCount/],
  ['unexpected oracle caller', f => f.set(f.c('CompositeOracle'), 'authorizedCallerCount', [], 1n), /authorizedCallerCount/],
  ['missing strict backing policy', f => f.set(f.c('Factory'), 'tokenRequiresStrictProtectedPrice', [f.c('Token:USDC')], false), /tokenRequiresStrictProtectedPrice/],
  ['raw stock oracle route', f => f.set(f.c('CompositeOracle'), 'getTokenOracleFeed', [f.c('Token:AAPLc')], f.c('ChainlinkOracleFeed')), /getTokenOracleFeed/],
  ['wrong pool backing', f => f.set(f.manifest.pools[0].address, 'BACKING_TOKEN', [], f.c('Token:NVDAc')), /BACKING_TOKEN/],
  ['wrong pool oracle', f => f.set(f.manifest.pools[0].address, 'getOracleInfo', [], [f.c('ChainlinkOracleFeed'), false, f.c('CoinbaseStockOracleFeed'), zeroAddress, false]), /pool oracle wiring/],
  ['wrong NFT owner', f => { const nft = f.reads.get(key(f.manifest.pools[0].address, 'shieldReceiptNFT')); f.set(nft, 'owner', [], EXPECTED_DEPLOYER); }, /ShieldReceiptNFT.owner/],
  ['wrong router module', f => f.set(f.c('BaseFactoryRouter'), 'createModule', [], f.c('BaseFactoryAdminModule')), /createModule/],
  ['wrong proxy implementation', f => f.storage.set(f.c('Factory').toLowerCase(), '0x' + '00'.repeat(12) + f.c('BasePoolRouter').slice(2)), /Proxy implementation/],
  ['replacement receipt', f => { f.receipts.get(f.manifest.contracts.Factory.txHash).transactionHash = zeroHash; }, /receipt transaction hash/],
  ['changed transaction sender', f => { f.transactions.get(f.manifest.contracts.Factory.txHash).from = zeroAddress; }, /sender/],
  ['missing confirmation', f => { const record = f.manifest.transactions['deploy:Factory']; record.receipt.blockNumber = '200'; f.receipts.get(record.hash).blockNumber = 200n; }, /two confirmations/],
  ['wrong factory event emitter', f => { f.receipts.get(f.manifest.transactions['pool:create:tAAPLc'].hash).logs[0].address = EXPECTED_DEPLOYER; }, /factory creation event/],
]) test(`rejects ${label}`, async () => { const f = fixture(); mutate(f); await assert.rejects(verifyBaseDeployment(f), expected); });

test('linked module runtime cannot silently point to a different library', async () => {
  const f = fixture(), target = f.c('BaseFactoryCreateModule');
  const code = '0x60' + zeroAddress.slice(2) + f.codes.get(target.toLowerCase()).slice(-2);
  f.codes.set(target.toLowerCase(), code); f.manifest.contracts.BaseFactoryCreateModule.runtimeCodehash = keccak256(code);
  await assert.rejects(verifyBaseDeployment(f), /runtime differs from reviewed artifact/);
});

test('verification block reorg prevents publication', async () => {
  const f = fixture(); f.client.getBlock = async request => ({ number: 200n, hash: request.blockNumber ? zeroHash : blockHash });
  await assert.rejects(verifyBaseDeployment(f), /Verification block reorged/);
});

test('failed verification preserves the frontend file; success replaces it atomically', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'ys-sync-review-')), outputPath = join(folder, 'deployments.ts');
  try {
    writeFileSync(outputPath, 'existing frontend configuration');
    const invalid = fixture(); invalid.set(invalid.c('Factory'), 'bootstrapModeEnabled', [], true);
    await assert.rejects(publishBaseDeployment({ ...invalid, outputPath }), /bootstrapModeEnabled/);
    assert.equal(readFileSync(outputPath, 'utf8'), 'existing frontend configuration'); assert.deepEqual(readdirSync(folder), ['deployments.ts']);
    const good = fixture(); await publishBaseDeployment({ ...good, outputPath });
    assert.match(readFileSync(outputPath, 'utf8'), /84532: \{/); assert.match(readFileSync(outputPath, 'utf8'), /deploymentBlock: 100n/);
    assert.deepEqual(readdirSync(folder), ['deployments.ts']);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});


function faucetFixture() {
  const f = fixture();
  f.manifest.status = 'awaiting-live-session'; f.manifest.pools = [];
  for (const asset of f.manifest.assets) f.set(asset.testToken, 'balanceOf', [f.c('Faucet')], 1000000n * 10n ** BigInt(asset.decimals));
  return f;
}
test('faucet preparation requires finalized infrastructure even without stock pools', async () => {
  const f = faucetFixture(); f.set(f.c('Faucet'), 'owner', [], EXPECTED_DEPLOYER);
  assert.deepEqual(await verifyBaseFaucetPreparation(f), { faucet: f.c('Faucet'), verifiedBlock: 200n });
  f.set(f.c('Factory'), 'bootstrapModeEnabled', [], true);
  await assert.rejects(verifyBaseFaucetPreparation(f), /bootstrapModeEnabled/);
});
test('faucet preparation rejects an unrelated owner', async () => {
  const f = faucetFixture(); f.set(f.c('Faucet'), 'owner', [], zeroAddress);
  await assert.rejects(verifyBaseFaucetPreparation(f), /Unexpected faucet owner/);
});
test('funded governed faucet may publish while pools remain incomplete', async () => {
  const f = faucetFixture();
  assert.deepEqual(await verifyBaseFaucet(f), { faucet: f.c('Faucet'), verifiedBlock: 200n });
  await assert.rejects(verifyBaseDeployment({ ...f, scope: 'faucet' }), /Public deployment is not complete/);
});
for (const [label, mutate, pattern] of [
  ['unfunded token', f => f.set(f.manifest.assets[0].testToken, 'balanceOf', [f.c('Faucet')], 0n), /faucet needs funding/],
  ['untransferred ownership', f => f.set(f.c('Faucet'), 'owner', [], EXPECTED_DEPLOYER), /owner/],
  ['disabled token', f => f.set(f.c('Faucet'), 'enabledTokens', [f.manifest.assets[0].testToken], false), /enabledTokens/],
  ['wrong drip', f => f.set(f.c('Faucet'), 'dripAmount', [f.manifest.assets[0].testToken], 1n), /dripAmount/],
  ['changed source', f => { f.manifest.assets[0].sourceFeed = zeroAddress; }, /source feed/],
  ['unreviewed runtime', f => { const target = f.c('Faucet'); f.codes.set(target.toLowerCase(), '0x60ff00'); f.manifest.contracts.Faucet.runtimeCodehash = keccak256('0x60ff00'); }, /runtime differs/],
]) test(`faucet publication rejects ${label}`, async () => { const f = faucetFixture(); mutate(f); await assert.rejects(verifyBaseFaucet(f), pattern); });
test('faucet publication contains no protocol addresses and preserves the previous file on failure', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'ys-faucet-publish-')), outputPath = join(folder, 'faucet-deployments.ts');
  try {
    const f = faucetFixture(); writeFileSync(outputPath, 'previous');
    f.set(f.c('Faucet'), 'owner', [], EXPECTED_DEPLOYER);
    await assert.rejects(publishBaseFaucet({ ...f, outputPath }), /owner/);
    assert.equal(readFileSync(outputPath, 'utf8'), 'previous');
    f.set(f.c('Faucet'), 'owner', [], f.c('Timelock'));
    await publishBaseFaucet({ ...f, outputPath });
    const contents = readFileSync(outputPath, 'utf8');
    assert(contents.includes(f.c('Faucet'))); assert(!contents.includes(f.c('Factory'))); assert(!contents.includes(f.c('CompositeOracle')));
    assert.deepEqual(readdirSync(folder), ['faucet-deployments.ts']);
    await assert.rejects(publishBaseDeployment({ ...f, outputPath, scope: 'faucet' }), /Public deployment is not complete/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
