const assert = require("node:assert/strict");
const test = require("node:test");
const { createHermesClient } = require("../update-pyth-prices.cjs");

test("real Hermes client validates price updates with patched Zod", async (t) => {
    let body = { binary: { encoding: "hex", data: ["00"] }, parsed: [] };
    t.mock.method(globalThis, "fetch", async (url, options) => {
        assert.equal(new URL(url).origin, "https://hermes.example.invalid");
        assert.equal(options.headers.Authorization, "Bearer test-api-key");
        return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    });
    const client = await createHermesClient({
        hermesUrl: "https://hermes.example.invalid",
        apiKey: "test-api-key",
    });
    client.httpRetries = 0;
    const ids = ["a".repeat(64)];
    assert.deepEqual(await client.getLatestPriceUpdates(ids), body);
    body = { binary: { encoding: "hex", data: [123] }, parsed: [] };
    await assert.rejects(() => client.getLatestPriceUpdates(ids));
});
