import { expect } from 'bun:test';
import { EvmMock, HttpActionsMock, newTestRuntime, test } from '@chainlink/cre-sdk/test';
import { blockNumber, bytesToHex, protoBigIntToBigint } from '@chainlink/cre-sdk';
import { decodeFunctionData, encodeAbiParameters, hexToBytes, parseAbi } from 'viem';
import configJson from './config.json';
import { configSchema } from './health';
import { onCron } from './workflow';

const config = configSchema.parse(configJson);
const now = 1_800_000_000;
const base64 = (v: Uint8Array) => btoa(String.fromCharCode(...v));
const abi = parseAbi([
  'function totalProtectorTokens() view returns (uint256)',
  'function totalShieldCollateralAmount() view returns (uint256)',
  'function paused() view returns (bool)',
  'function getPrice(address) view returns (uint256)',
  'function isPriceStale(address) view returns (bool,uint64)',
]);
const response = {
  chainId: 10143, blockNumber: '12345', blockTimestamp: String(now), contractsVerified: true,
  markets: config.pools.map(p => ({ ...p, totalBacking: '1000000000', reserved: '100000000', paused: false })),
  assets: config.assets.map(a => ({ ...a, healthy: true, price: '100000000' })),
};

test('official CRE runtime orchestrates HTTP plus exactly 13 same-block EVM reads', () => {
  const runtime = newTestRuntime(null, { timeProvider: () => now * 1000 }, config);
  let httpCalls = 0, evmCalls = 0;
  HttpActionsMock.testInstance().sendRequest = req => {
    httpCalls++;
    expect(req.method).toBe('GET');
    expect(req.url).toBe(config.apiUrl);
    expect(req.timeout?.seconds).toBe(10n);
    return { statusCode: 200, body: base64(new TextEncoder().encode(JSON.stringify(response))) };
  };
  const evm = EvmMock.testInstance(2183018362218727504n);
  evm.headerByNumber = req => {
    evmCalls++;
    expect(protoBigIntToBigint(req.blockNumber!)).toBe(12345n);
    return { header: { blockNumber: blockNumber(12345n), timestamp: String(now) } };
  };
  evm.callContract = req => {
    evmCalls++;
    expect(protoBigIntToBigint(req.blockNumber!)).toBe(12345n);
    const decoded = decodeFunctionData({ abi, data: bytesToHex(req.call!.data) });
    const values = decoded.functionName === 'paused' ? encodeAbiParameters([{ type: 'bool' }], [false])
      : decoded.functionName === 'isPriceStale' ? encodeAbiParameters([{ type: 'bool' }, { type: 'uint64' }], [false, BigInt(now - 30)])
      : encodeAbiParameters([{ type: 'uint256' }], [decoded.functionName === 'totalProtectorTokens' ? 1000000000n : 100000000n]);
    return { data: base64(hexToBytes(values)) };
  };
  const report = JSON.parse(onCron(runtime));
  expect(report.status).toBe('healthy');
  expect(report.pools).toHaveLength(2);
  expect(report.assets).toHaveLength(3);
  expect(httpCalls).toBe(1);
  expect(evmCalls).toBe(13);
  expect(runtime.getLogs().join('\n')).toContain('YieldShield CRE: healthy');
});

test('HTTP failure ends the workflow rather than returning a healthy report', () => {
  const runtime = newTestRuntime(null, { timeProvider: () => now * 1000 }, config);
  HttpActionsMock.testInstance().sendRequest = () => ({ statusCode: 503 });
  expect(() => onCron(runtime)).toThrow('HTTP 503');
});

test('onchain stale signals produce critical alerts without calling protected price getters', () => {
  const runtime = newTestRuntime(null, { timeProvider: () => now * 1000 }, config);
  const unavailable = { ...response, assets: response.assets.map((a, i) => i < 2 ? { ...a, healthy: false, price: null } : a) };
  HttpActionsMock.testInstance().sendRequest = () => ({ statusCode: 200, body: base64(new TextEncoder().encode(JSON.stringify(unavailable))) });
  const evm = EvmMock.testInstance(2183018362218727504n);
  let calls = 0;
  evm.headerByNumber = req => {
    calls++;
    expect(protoBigIntToBigint(req.blockNumber!)).toBe(12345n);
    return { header: { blockNumber: blockNumber(12345n), timestamp: String(now) } };
  };
  evm.callContract = req => {
    calls++;
    expect(protoBigIntToBigint(req.blockNumber!)).toBe(12345n);
    const decoded = decodeFunctionData({ abi, data: bytesToHex(req.call!.data) });
    const isReference = decoded.args?.[0]?.toLowerCase() === config.assets[0].address.toLowerCase() || decoded.args?.[0]?.toLowerCase() === config.assets[1].address.toLowerCase();
    if (decoded.functionName === 'getPrice' && isReference) throw new Error('A protected price read would revert');
    const values = decoded.functionName === 'paused' ? encodeAbiParameters([{ type: 'bool' }], [false])
      : decoded.functionName === 'isPriceStale' ? encodeAbiParameters([{ type: 'bool' }, { type: 'uint64' }], [isReference, isReference ? 0n : BigInt(now - 30)])
      : encodeAbiParameters([{ type: 'uint256' }], [decoded.functionName === 'totalProtectorTokens' ? 1000000000n : 100000000n]);
    return { data: base64(hexToBytes(values)) };
  };
  const report = JSON.parse(onCron(runtime));
  expect(calls).toBe(11);
  expect(report.status).toBe('critical');
  expect(report.pools.every((p: { apiMatches: boolean }) => p.apiMatches)).toBe(true);
  expect(report.assets.slice(0, 2)).toMatchObject([{ price: null, healthy: false, apiMatches: true }, { price: null, healthy: false, apiMatches: true }]);
  expect(report.alerts.map((a: { code: string }) => a.code)).toEqual(['oracle-price-unavailable', 'oracle-price-unavailable']);
  expect(runtime.getLogs().join('\n')).toContain('YieldShield CRE: critical');
});

test('an EVM capability failure still aborts instead of becoming an oracle alert', () => {
  const runtime = newTestRuntime(null, { timeProvider: () => now * 1000 }, config);
  HttpActionsMock.testInstance().sendRequest = () => ({ statusCode: 200, body: base64(new TextEncoder().encode(JSON.stringify(response))) });
  const evm = EvmMock.testInstance(2183018362218727504n);
  evm.headerByNumber = () => ({ header: { blockNumber: blockNumber(12345n), timestamp: String(now) } });
  evm.callContract = () => { throw new Error('RPC unavailable'); };
  expect(() => onCron(runtime)).toThrow('RPC unavailable');
});
