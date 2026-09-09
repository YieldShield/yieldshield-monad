import { test, before, after } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
const { server } = await import("./server.mjs");
let origin;
before(async () => {
  await new Promise((r, reject) => server.once("error", reject).listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));
test("public liveness is separate from price or market readiness", async () => {
  const r = await fetch(origin + "/health");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.chainId, 10143);
  assert.equal(body.status, "ok");
  assert.equal(body.markets, undefined);
});
test("API is read-only and rejects writes", async () => {
  const r = await fetch(origin + "/api/status", { method: "POST" });
  assert.equal(r.status, 405);
  assert.equal((await r.json()).error, "Read-only API");
});
test("unknown routes and foreign origins cannot become an authorized API flow", async () => {
  const r = await fetch(origin + "/missing", { headers: { Origin: "https://unrelated.example" } });
  assert.equal(r.status, 404);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  const known = await fetch(origin + "/health", { headers: { Origin: "https://monad.yieldshield.ai" } });
  assert.equal(known.headers.get("access-control-allow-origin"), "https://monad.yieldshield.ai");
});
