import {
  CronCapability, EVMClient, HTTPClient, Runner, blockNumber, bytesToHex,
  consensusIdenticalAggregation, encodeCallMsg, getNetwork, handler, protoBigIntToBigint,
  type HTTPSendRequester, type Runtime,
} from '@chainlink/cre-sdk';
import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from 'viem';
import { configSchema, evaluateHealth, parseSnapshot, validateBlock, type ApiSnapshot, type Config } from './health';

const poolAbi = parseAbi([
  'function totalProtectorTokens() view returns (uint256)',
  'function totalShieldCollateralAmount() view returns (uint256)',
  'function paused() view returns (bool)',
]);
const feedAbi = parseAbi([
  'function getPrice(address) view returns (uint256)',
  'function isPriceStale(address) view returns (bool,uint64)',
]);

export function fetchSnapshot(requester: HTTPSendRequester, config: Config): ApiSnapshot {
  const response = requester.sendRequest({ url: config.apiUrl, method: 'GET', timeout: '10s' }).result();
  if (response.statusCode !== 200) throw new Error(`YieldShield API returned HTTP ${response.statusCode}`);
  if (response.body.length > 100_000) throw new Error('YieldShield API response exceeds workflow bound');
  return parseSnapshot(JSON.parse(new TextDecoder().decode(response.body)), config);
}

export function onCron(runtime: Runtime<Config>): string {
  const config = configSchema.parse(runtime.config);
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainName });
  if (!network || network.chainSelector.selector !== 2183018362218727504n) throw new Error('Monad testnet selector mismatch');
  const client = new EVMClient(network.chainSelector.selector);
  // All nodes must agree on the same compact API observation. A disagreement fails closed.
  const snapshot = new HTTPClient().sendRequest(runtime, fetchSnapshot, consensusIdenticalAggregation<ApiSnapshot>())(config).result();
  const atBlock = blockNumber(snapshot.blockNumber);
  const { header } = client.headerByNumber(runtime, { blockNumber: atBlock }).result();
  if (!header?.blockNumber) throw new Error('Monad block header unavailable');
  const observedAt = Math.floor(runtime.now().getTime() / 1000);
  validateBlock(snapshot, protoBigIntToBigint(header.blockNumber), header.timestamp, observedAt, config);

  const call = (target: string, data: `0x${string}`) => bytesToHex(client.callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddress, to: target as Address, data }), blockNumber: atBlock,
  }).result().data);
  const pools = config.pools.map(pool => ({
    address: pool.address,
    totalBacking: decodeFunctionResult({ abi: poolAbi, functionName: 'totalProtectorTokens', data: call(pool.address, encodeFunctionData({ abi: poolAbi, functionName: 'totalProtectorTokens' })) }),
    reserved: decodeFunctionResult({ abi: poolAbi, functionName: 'totalShieldCollateralAmount', data: call(pool.address, encodeFunctionData({ abi: poolAbi, functionName: 'totalShieldCollateralAmount' })) }),
    paused: decodeFunctionResult({ abi: poolAbi, functionName: 'paused', data: call(pool.address, encodeFunctionData({ abi: poolAbi, functionName: 'paused' })) }),
  }));
  const assets = config.assets.map(asset => {
    const args = [asset.address as Address] as const;
    const price = decodeFunctionResult({ abi: feedAbi, functionName: 'getPrice', data: call(asset.feed, encodeFunctionData({ abi: feedAbi, functionName: 'getPrice', args })) });
    const [stale, publishedAt] = decodeFunctionResult({ abi: feedAbi, functionName: 'isPriceStale', data: call(asset.feed, encodeFunctionData({ abi: feedAbi, functionName: 'isPriceStale', args })) });
    return { address: asset.address, price, stale, publishedAt };
  });
  const report = evaluateHealth(config, snapshot, pools, assets, header.timestamp, observedAt);
  runtime.log(`YieldShield CRE: ${report.status}; Monad block ${report.blockNumber}; ${report.pools.length} pools; ${report.alerts.length} alerts`);
  for (const alert of report.alerts) runtime.log(`${alert.severity}: ${alert.code} (${alert.subject})`);
  return JSON.stringify(report);
}

export function initWorkflow(config: Config) {
  configSchema.parse(config);
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCron)];
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
