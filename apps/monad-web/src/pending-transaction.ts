import type { Hash } from "viem";

type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = "yieldshield-monad:pending-transaction";

/** Keep the sending lock in memory if browser storage is blocked or full. */
export function createPendingTransactionStore(storage: () => StorageAccess) {
  let loaded = false;
  let current: Hash | null = null;
  return {
    get() {
      if (!loaded) {
        loaded = true;
        try {
          const value = storage().getItem(key);
          if (value && /^0x[0-9a-f]{64}$/i.test(value)) current = value as Hash;
        } catch {
          // Persistence is optional; the current page still tracks submitted transactions.
        }
      }
      return current;
    },
    set(hash: Hash | null) {
      loaded = true;
      current = hash;
      try {
        if (hash) storage().setItem(key, hash);
        else storage().removeItem(key);
      } catch {
        // Do not discard an unconfirmed hash or resurrect a confirmed one.
      }
    },
  };
}
