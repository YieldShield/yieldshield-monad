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

test("rotating forwarding headers cannot bypass the API request limit", async () => {
  let limited = false;
  for (let i = 0; i < 91; i++) {
    const response = await fetch(origin + "/api/registry", {
      headers: {
        "X-Forwarded-For": `198.51.100.${i + 1}`,
        "X-Real-IP": `203.0.113.${i + 1}`,
        Origin: "https://monad.yieldshield.ai",
      },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), "https://monad.yieldshield.ai");
    await response.arrayBuffer();
    if (response.status === 429) {
      limited = true;
      break;
    }
    assert.equal(response.status, 200);
  }
  assert.equal(limited, true);
  const retry = await fetch(origin + "/api/registry", {
    headers: { "X-Forwarded-For": "192.0.2.200", Origin: "https://monad.yieldshield.ai" },
  });
  assert.equal(retry.status, 429);
  assert.equal(retry.headers.get("access-control-allow-origin"), "https://monad.yieldshield.ai");
  assert.equal((await retry.json()).error, "Please wait before refreshing.");
  const health = await fetch(origin + "/health");
  assert.equal(health.status, 200);
});
