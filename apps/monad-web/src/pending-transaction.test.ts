import { describe, expect, it, vi } from "vitest";
import { createPendingTransactionStore } from "./pending-transaction";

const hash = `0x${"ab".repeat(32)}` as const;
const blocked = () => {
  throw new Error("Storage is unavailable");
};

describe("pending transaction recovery", () => {
  it("restores only valid transaction hashes", () => {
    expect(
      createPendingTransactionStore(() => ({ getItem: () => hash, setItem: vi.fn(), removeItem: vi.fn() })).get(),
    ).toBe(hash);
    expect(
      createPendingTransactionStore(() => ({ getItem: () => "invalid", setItem: vi.fn(), removeItem: vi.fn() })).get(),
    ).toBeNull();
  });

  it("retains an unconfirmed transaction when storage access is blocked", () => {
    const store = createPendingTransactionStore(blocked);
    expect(store.get()).toBeNull();
    store.set(hash);
    // A receipt timeout must keep a later execute() from sending again.
    expect(store.get()).toBe(hash);
    store.set(null);
    expect(store.get()).toBeNull();
  });

  it("retains a transaction when storage can be read but is full", () => {
    const store = createPendingTransactionStore(() => ({ getItem: () => null, setItem: blocked, removeItem: vi.fn() }));
    store.set(hash);
    expect(store.get()).toBe(hash);
  });

  it("does not permanently block a confirmed transaction when storage removal fails", () => {
    const store = createPendingTransactionStore(() => ({ getItem: () => hash, setItem: vi.fn(), removeItem: blocked }));
    expect(store.get()).toBe(hash);
    store.set(null);
    expect(store.get()).toBeNull();
  });
});
