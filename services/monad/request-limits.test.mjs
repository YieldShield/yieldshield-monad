import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, requestIp } from "./request-limits.mjs";

const request = (headers = {}) => ({ headers, socket: { remoteAddress: "192.0.2.5" } });

test("direct requests cannot choose a rate-limit identity through proxy headers", () => {
  for (const spoof of ["198.51.100.1", "198.51.100.2", "2001:db8::1"]) {
    assert.equal(requestIp(request({ "x-forwarded-for": spoof, "x-real-ip": spoof })), "192.0.2.5");
  }
});

test("Railway trusts its single edge IP, not an arbitrary forwarded chain", () => {
  for (const spoof of ["198.51.100.1", "198.51.100.2, 198.51.100.3"]) {
    assert.equal(
      requestIp(request({ "x-real-ip": "203.0.113.1", "x-forwarded-for": spoof }), { trustRailwayProxy: true }),
      "203.0.113.1",
    );
  }
  assert.equal(requestIp(request({ "x-real-ip": "2001:DB8::1" }), { trustRailwayProxy: true }), "2001:db8::1");
});

test("missing or malformed trusted headers fall back to the socket peer", () => {
  for (const value of [undefined, "garbage", "203.0.113.1, 203.0.113.2", ["203.0.113.1"], "203.0.113.1:443"]) {
    assert.equal(requestIp(request({ "x-real-ip": value }), { trustRailwayProxy: true }), "192.0.2.5");
  }
});

test("rotating spoofed forwarding headers does not reset the request quota", () => {
  const allowed = createRateLimiter({ limit: 2 });
  assert.equal(allowed(requestIp(request({ "x-forwarded-for": "198.51.100.1" }))), true);
  assert.equal(allowed(requestIp(request({ "x-forwarded-for": "198.51.100.2" }))), true);
  assert.equal(allowed(requestIp(request({ "x-forwarded-for": "198.51.100.3" }))), false);
});

test("capacity rejects new identities without clearing active limits", () => {
  const allowed = createRateLimiter({ limit: 1, maxEntries: 2 });
  assert.equal(allowed("first"), true);
  assert.equal(allowed("second"), true);
  assert.equal(allowed("overflow"), false);
  assert.equal(allowed("first"), false);
  assert.equal(allowed("second"), false);
});

test("expired windows release capacity and refresh only expired quotas", () => {
  let time = 0;
  const allowed = createRateLimiter({ now: () => time, limit: 1, windowMs: 100, maxEntries: 2 });
  assert.equal(allowed("first"), true);
  time = 50;
  assert.equal(allowed("second"), true);
  time = 100;
  assert.equal(allowed("third"), true);
  assert.equal(allowed("second"), false);
  time = 150;
  assert.equal(allowed("second"), true);
  assert.equal(allowed("third"), false);
});
