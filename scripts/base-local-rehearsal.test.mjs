import test from "node:test";
import assert from "node:assert/strict";
import { assertLoopbackRpc } from "./base-local-rehearsal.mjs";

test("local rehearsal accepts an explicit IPv4 loopback port", () => {
  assert.doesNotThrow(() => assertLoopbackRpc("http://127.0.0.1:18543"));
});
for (const rpc of [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
  "http://192.168.1.1:8545",
  "http://localhost:8545",
  "http://127.0.0.1.evil.example:8545",
  "http://127.0.0.1:8545@evil.example:8545",
  "https://127.0.0.1:8545",
  "http://127.0.0.1",
  "http://user:password@127.0.0.1:8545",
  "http://127.0.0.1:8545/proxy",
  "http://127.0.0.1:8545/?target=remote",
  "http://127.0.0.1:8545/#remote",
])
  test(`rehearsal refuses noncanonical destination ${rpc}`, () => assert.throws(() => assertLoopbackRpc(rpc)));
