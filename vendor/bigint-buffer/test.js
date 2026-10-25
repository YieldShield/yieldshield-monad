"use strict";

const assert = require("node:assert/strict");
const { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE } = require("./dist/node.js");

assert.equal(toBigIntBE(Buffer.from("1234", "hex")), 0x1234n);
assert.equal(toBigIntLE(Buffer.from("3412", "hex")), 0x1234n);
assert.deepEqual(toBufferBE(0x1234n, 2), Buffer.from("1234", "hex"));
assert.deepEqual(toBufferLE(0x1234n, 2), Buffer.from("3412", "hex"));
assert.equal(toBigIntBE(Buffer.alloc(0)), 0n);
assert.equal(toBigIntLE(Buffer.alloc(0)), 0n);
