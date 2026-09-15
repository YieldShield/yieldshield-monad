import { describe, expect, it, vi } from "vitest";
import { createPublicClient, http, type Address } from "viem";
import { retryRateLimitedReads } from "./rpc-read-retry";

const limited = { code: -32011, message: "requests limited to 15/sec" };
const call = (to: Address) => ({ method: "eth_call" as const, params: [{ to, data: "0x12345678" }, "0x1234"] }) as const;

describe("browser Monad read retries", () => {
  it("retries only the limited member of an HTTP-200 batch at its original block", async () => {
    const requests: any[][] = [];
    const sleep = vi.fn(async () => {});
    const client = createPublicClient({
      transport: retryRateLimitedReads(
        http("https://rpc.example/browser-partial", {
          retryCount: 0,
          batch: { batchSize: 10, wait: 1 },
          fetchFn: async (_, options) => {
            const batch = JSON.parse(String(options?.body));
            requests.push(batch);
            return Response.json(
              batch.map((item: any) => ({
                id: item.id,
                jsonrpc: "2.0",
                ...(requests.length === 1 && item.params[0].to === "0x02" ? { error: limited } : { result: "0x01" }),
              })),
            );
          },
        }),
        sleep,
      ),
    });
    expect(await Promise.all([client.request(call("0x01")), client.request(call("0x02"))])).toEqual(["0x01", "0x01"]);
    expect(requests.map((batch) => batch.length)).toEqual([2, 1]);
    expect(requests[1][0].params).toEqual(call("0x02").params);
    expect(sleep).toHaveBeenCalledWith(1100, undefined);
  });

  it("fails closed after two retries and preserves the provider error", async () => {
    const fetchFn = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, error: limited }));
    const sleep = vi.fn(async () => {});
    const connection = retryRateLimitedReads(
      http("https://rpc.example/browser-exhausted", { retryCount: 0, fetchFn }),
      sleep,
    )({});
    await expect(connection.request(call("0x01"))).rejects.toMatchObject({ code: -32011 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([
      [1100, undefined],
      [2200, undefined],
    ]);
  });

  it.each([
    { code: 3, message: "execution reverted: stale oracle" },
    { code: -32602, message: "Invalid params" },
    { code: -32011, message: "execution reverted" },
  ])("does not retry semantic errors: $message", async (error) => {
    const fetchFn = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, error }));
    const sleep = vi.fn(async () => {});
    const connection = retryRateLimitedReads(
      http("https://rpc.example/browser-semantic", { retryCount: 0, fetchFn }),
      sleep,
    )({});
    await expect(connection.request(call("0x01"))).rejects.toBeDefined();
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each(["eth_sendTransaction", "eth_sendRawTransaction", "personal_sign", "eth_signTypedData_v4"])(
    "never retries %s, including viem's default HTTP-error retries",
    async (method) => {
      const fetchFn = vi.fn(async () => new Response("Unavailable", { status: 503 }));
      const sleep = vi.fn(async () => {});
      const connection = retryRateLimitedReads(
        http("https://rpc.example/browser-write", { retryCount: 3, fetchFn }),
        sleep,
      )({});
      await expect(connection.request({ method, params: [] })).rejects.toBeDefined();
      expect(fetchFn).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it("cancels a delayed retry before another RPC request", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, error: limited }));
    const connection = retryRateLimitedReads(
      http("https://rpc.example/browser-abort", { retryCount: 0, fetchFn }),
      async () => {
        controller.abort();
      },
    )({});
    await expect(connection.request(call("0x01"), { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
