import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePythUpdate } from "./pyth.mjs";
const id = "0x" + "11".repeat(32),
  now = 1000000;
const payload = () => ({
  binary: { encoding: "hex", data: ["aabb"] },
  parsed: [{ id: id.slice(2), price: { price: "2600000", publish_time: 990, expo: -8, conf: "1" } }],
});
test("signed payload identity and freshness are required before an update is offered", () => {
  assert.deepEqual(validatePythUpdate(payload(), id, now).updateData, ["0xaabb"]);
  for (const [field, value] of [
    ["publish_time", 1006],
    ["publish_time", 909],
    ["price", "0"],
    ["price", "-1"],
  ]) {
    const p = payload();
    p.parsed[0].price[field] = value;
    assert.throws(() => validatePythUpdate(p, id, now));
  }
  assert.throws(() => validatePythUpdate(payload(), "0x" + "22".repeat(32), now));
});
test("malformed binary data cannot become transaction input", () => {
  for (const data of [[], ["abc"], ["zz"], ["aa".repeat(100001)]]) {
    const p = payload();
    p.binary.data = data;
    assert.throws(() => validatePythUpdate(p, id, now));
  }
  const p = payload();
  p.binary.encoding = "base64";
  assert.throws(() => validatePythUpdate(p, id, now));
});
