import test from "node:test";
import assert from "node:assert/strict";
import { HttpRequestError, RpcRequestError } from "viem";
import { protectionStatusReady, safeRefreshError } from "./base-api.mjs";
import { unavailableDemoStatus } from "./base-demo-status.mjs";
import { unavailableProtectionStatus } from "./base-protection-status.mjs";

const now = () => 1_000_000;
const verified = () => ({
  deployment: { verified: true },
  evaluatedAt: 990,
  validUntil: 1010,
});

test("health does not report readiness for startup or fresh unavailable snapshots", () => {
  for (const status of [undefined, unavailableDemoStatus({ now }), unavailableProtectionStatus({ now })]) {
    assert.equal(protectionStatusReady(status, { now }), false);
  }
});

test("health reports verified fresh status without requiring every action to be available", () => {
  const status = { ...verified(), assets: [{ actions: { protectedExit: { state: "position-required" } } }] };
  assert.equal(protectionStatusReady(status, { now }), true);
  assert.equal(protectionStatusReady(status, { now: () => 989_999 }), false);
  assert.equal(protectionStatusReady(status, { now: () => 1_010_000 }), false);
});

test("health rejects unverified, malformed and future-dated status", () => {
  for (const override of [
    { deployment: { verified: false } },
    { deployment: { verified: "true" } },
    { evaluatedAt: 1001 },
    { evaluatedAt: undefined },
    { validUntil: Infinity },
    { validUntil: "1010" },
    { validUntil: 1000 },
  ])
    assert.equal(protectionStatusReady({ ...verified(), ...override }, { now }), false);
});

test("HTTP failure diagnostics retain rate limits and connection codes without request data", () => {
  const cause = Object.assign(new Error("private transport detail"), { code: "ECONNRESET" });
  const error = new HttpRequestError({
    url: "https://secret-user:secret-password@rpc.example.test/private-api-key",
    headers: new Headers({ Authorization: "Bearer private-bearer-token" }),
    body: { params: ["0x1111111111111111111111111111111111111111"] },
    details: "private provider detail",
    status: 429,
    cause,
  });
  assert.deepEqual(safeRefreshError(error), {
    errorTypes: ["HttpRequestError", "Error"],
    errorCodes: ["ECONNRESET"],
    httpStatuses: [429],
  });
  const output = JSON.stringify(safeRefreshError(error));
  for (const sensitive of ["https://", "private", "secret", "0x1111", "Authorization", "Bearer"]) {
    assert.equal(output.includes(sensitive), false);
  }
});

test("RPC and verification diagnostics preserve only recognized codes and types", () => {
  const rpcError = new RpcRequestError({
    url: "https://rpc.example.test/private-api-key",
    body: { params: ["private wallet data"] },
    error: { code: -32005, message: "private provider detail" },
  });
  assert.deepEqual(safeRefreshError(rpcError), { errorTypes: ["RpcRequestError"], errorCodes: [-32005] });
  const verificationError = new assert.AssertionError({
    message: "private transaction data",
    actual: "private transaction hash",
    expected: "private expected value",
  });
  assert.deepEqual(safeRefreshError(verificationError), {
    errorTypes: ["AssertionError"],
    errorCodes: ["ERR_ASSERTION"],
  });
});

test("unknown and cyclic failures produce bounded diagnostics with no arbitrary error fields", () => {
  const error = { name: "private error name", code: "private code", status: "private status" };
  error.cause = error;
  assert.deepEqual(safeRefreshError(error), { errorTypes: ["UnknownError"] });
  assert.deepEqual(safeRefreshError("private error message"), { errorTypes: ["UnknownError"] });
  assert.deepEqual(safeRefreshError(null), { errorTypes: ["UnknownError"] });
});
