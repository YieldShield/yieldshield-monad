import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshConfirmedPositions } from "./confirmed-position-refresh";

afterEach(() => vi.useRealTimers());

describe("position data after a confirmed transaction", () => {
  it("replaces a cached empty list after the API cache expires, even without a mounted subscriber", async () => {
    vi.useFakeTimers();
    const expires = Date.now() + 5000;
    const read = vi.fn(async () => ({ positions: Date.now() < expires ? [] : [{ id: "4" }] }));
    const publish = vi.fn(async () => undefined);
    const refresh = refreshConfirmedPositions(read, publish);
    await vi.advanceTimersByTimeAsync(5000);
    expect(publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    await refresh;
    expect(read).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledExactlyOnceWith({ positions: [{ id: "4" }] });
  });

  it("starts the cache wait after a slow pre-transaction read finishes", async () => {
    vi.useFakeTimers();
    let finish!: (snapshot: { positions: string[] }) => void;
    const pending = new Promise<{ positions: string[] }>((resolve) => {
      finish = resolve;
    });
    const read = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce({ positions: [] });
    const publish = vi.fn(async () => undefined);
    const refresh = refreshConfirmedPositions(read, publish);
    await vi.advanceTimersByTimeAsync(15000);
    expect(read).toHaveBeenCalledTimes(1);
    finish({ positions: ["closed-receipt"] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    await refresh;
    expect(publish).toHaveBeenCalledExactlyOnceWith({ positions: [] });
  });

  it("does not claim freshness when the initial read times out while the server may still be working", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("temporary outage"));
    const publish = vi.fn(async () => undefined);
    await expect(refreshConfirmedPositions(read, publish, async () => {})).rejects.toThrow("temporary outage");
    expect(read).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it("surfaces a persistent data outage without publishing the old result or retrying indefinitely", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ positions: [] })
      .mockRejectedValueOnce(new Error("positions unavailable"));
    const publish = vi.fn(async () => undefined);
    await expect(refreshConfirmedPositions(read, publish, async () => {})).rejects.toThrow("positions unavailable");
    expect(read).toHaveBeenCalledTimes(2);
    expect(publish).not.toHaveBeenCalled();
  });
});
