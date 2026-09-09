import { afterEach, describe, expect, it, vi } from "vitest";
import { base, baseSepolia } from "viem/chains";
import { createEvmAdapter } from "../src/adapter";
import { robinhoodTestnet } from "../src/chains";

const publicNode = "https://base-sepolia-rpc.publicnode.com";
const baseRpc = "https://sepolia.base.org";
const observed: { url: string; body: any }[] = [];
function mockRpc(handle?: (url: string, body: any) => Response | undefined) {
  observed.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit) => {
      const url = String(input).replace(/\/$/, ""),
        body = JSON.parse(String(init.body));
      observed.push({ url, body });
      const custom = handle?.(url, body);
      if (custom) return custom;
      const reply = (request: any) => ({ jsonrpc: "2.0", id: request.id, result: "0x14a34" });
      return Response.json(Array.isArray(body) ? body.map(reply) : reply(body));
    }),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Base Sepolia default RPC transport", () => {
  it("batches independent requests while preserving each pinned block argument", async () => {
    mockRpc();
    const adapter = createEvmAdapter({ chain: baseSepolia });
    const requests = ["0xa", "0xb", "0xc"].map((height) =>
      adapter.publicClient.request({
        method: "eth_getBlockByNumber",
        params: [height as `0x${string}`, false],
      }),
    );
    await Promise.all(requests);
    expect(adapter.rpcUrl).toBe(publicNode);
    expect(adapter.publicClient.transport.type).toBe("fallback");
    expect(adapter.transport).toBeDefined();
    expect(observed).toHaveLength(1);
    expect(observed[0]!.url).toBe(publicNode);
    expect(observed[0]!.body.map((request: any) => request.params)).toEqual([
      ["0xa", false],
      ["0xb", false],
      ["0xc", false],
    ]);
  });
  it("limits each batch to twenty requests", async () => {
    mockRpc();
    const { publicClient } = createEvmAdapter({ chain: baseSepolia });
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        publicClient.request({
          method: "eth_getBlockByNumber",
          params: [`0x${(index + 1).toString(16)}`, false],
        }),
      ),
    );
    expect(observed).toHaveLength(2);
    expect(observed.map(({ body }) => body.length).sort((a, b) => a - b)).toEqual([5, 20]);
  });
  it("falls back on rate limits without changing requested block identity", async () => {
    mockRpc((url) => (url === publicNode ? new Response("rate limited", { status: 429 }) : undefined));
    const { publicClient } = createEvmAdapter({ chain: baseSepolia });
    await publicClient.request({ method: "eth_getBlockByNumber", params: ["0x123", false] });
    expect(observed.map(({ url }) => url)).toEqual([publicNode, baseRpc]);
    expect(observed.every(({ body }) => body[0].params[0] === "0x123")).toBe(true);
  });
  it("preserves execution reverts instead of retrying them against another provider", async () => {
    mockRpc((_url, body) =>
      Response.json(
        body.map((request: any) => ({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: 3, message: "execution reverted", data: "0x1234" },
        })),
      ),
    );
    const { publicClient } = createEvmAdapter({ chain: baseSepolia });
    await expect(
      publicClient.request({
        method: "eth_call",
        params: [{ to: "0x1111111111111111111111111111111111111111", data: "0x" }, "0xa"],
      }),
    ).rejects.toThrow("execution reverted");
    expect(observed.map(({ url }) => url)).toEqual([publicNode]);
  });
  it.each(["http://127.0.0.1:8545", baseRpc])(
    "uses an explicit %s override exclusively without automatic batching",
    async (rpcUrl) => {
      mockRpc();
      const adapter = createEvmAdapter({ chain: baseSepolia, rpcUrl });
      await adapter.publicClient.request({ method: "eth_chainId" });
      expect(adapter.rpcUrl).toBe(rpcUrl);
      expect(adapter.publicClient.transport.type).toBe("http");
      expect(observed).toHaveLength(1);
      expect(observed[0]!.url).toBe(rpcUrl);
      expect(Array.isArray(observed[0]!.body)).toBe(false);
    },
  );
  it("preserves custom chain RPC metadata", async () => {
    mockRpc();
    const custom = "http://127.0.0.1:9545";
    const adapter = createEvmAdapter({ chain: { ...baseSepolia, rpcUrls: { default: { http: [custom] } } } });
    await adapter.publicClient.request({ method: "eth_chainId" });
    expect(adapter.rpcUrl).toBe(custom);
    expect(observed.map(({ url }) => url)).toEqual([custom]);
    expect(Array.isArray(observed[0]!.body)).toBe(false);
  });
  it.each([base, robinhoodTestnet])("preserves the $name transport", async (chain) => {
    mockRpc();
    const adapter = createEvmAdapter({ chain });
    await adapter.publicClient.request({ method: "eth_chainId" });
    expect(adapter.rpcUrl).toBe(chain.rpcUrls.default.http[0]);
    expect(adapter.publicClient.transport.type).toBe("http");
    expect(Array.isArray(observed[0]!.body)).toBe(false);
  });
});
