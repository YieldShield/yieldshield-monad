import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeFunctionResult, parseAbi, parseAbiParameters } from "viem";
import { createMonadReadClient } from "./read-client.mjs";

const abi = parseAbi(["function balanceOf(address) view returns(uint256)"]);
const token = "0x0000000000000000000000000000000000000001";
const holder = "0x0000000000000000000000000000000000000002";
const aggregateResult = (results) =>
  encodeAbiParameters(parseAbiParameters("(bool success, bytes returnData)[]"), [
    results.map((value) => ({
      success: value !== null,
      returnData: value === null ? "0x" : encodeFunctionResult({ abi, functionName: "balanceOf", result: value }),
    })),
  ]);
function fixture(respond) {
  const requests = [];
  const client = createMonadReadClient("https://rpc.invalid", {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      const reply = (request) => {
        requests.push(request);
        return { jsonrpc: "2.0", id: request.id, result: respond(request) };
      };
      return Response.json(Array.isArray(body) ? body.map(reply) : reply(body));
    },
  });
  const read = (blockNumber, account) =>
    client.readContract({
      address: token,
      abi,
      functionName: "balanceOf",
      args: [holder],
      blockNumber,
      ...(account ? { account } : {}),
    });
  return { requests, read };
}

test("parallel reads at the same block share one deployless call with exact results", async () => {
  const { requests, read } = fixture(() => aggregateResult([11n, 22n]));
  assert.deepEqual(await Promise.all([read(123n), read(123n)]), [11n, 22n]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "eth_call");
  assert.equal(requests[0].params[1], "0x7b");
  assert.equal(requests[0].params[0].to, undefined);
});

test("different block heights are never combined", async () => {
  const { requests, read } = fixture((request) => aggregateResult([BigInt(request.params[1])]));
  assert.deepEqual(await Promise.all([read(123n), read(124n)]), [123n, 124n]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((r) => r.params[1]).sort(), ["0x7b", "0x7c"]);
});

test("an individual revert remains a rejected read without hiding another result", async () => {
  const { requests, read } = fixture(() => aggregateResult([null, 22n]));
  const results = await Promise.allSettled([read(123n), read(123n)]);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "fulfilled");
  assert.equal(results[1].value, 22n);
  assert.equal(requests.length, 1);
});

test("calls with an explicit sender retain their original caller and bypass aggregation", async () => {
  const { requests, read } = fixture(() => encodeFunctionResult({ abi, functionName: "balanceOf", result: 7n }));
  assert.equal(await read(123n, holder), 7n);
  assert.equal(requests[0].params[0].from, holder);
  assert.equal(requests[0].params[0].to, token);
});
