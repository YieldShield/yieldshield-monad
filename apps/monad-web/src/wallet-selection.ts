import type { Address } from "viem";

type Selection = { address: Address; connector: object } | null;

/** An action belongs to one wallet selection, even if that wallet is selected again later. */
export function createWalletSelectionGuard() {
  let selection: Selection = null;
  let revision = 0;
  return {
    select(next: Selection) {
      if (selection?.address.toLowerCase() === next?.address.toLowerCase() && selection?.connector === next?.connector)
        return;
      selection = next;
      revision++;
    },
    capture(expected: Address | null) {
      const startedAt = revision;
      const assertCurrent = () => {
        if (!expected || !selection) throw new Error("Connect a wallet first.");
        if (revision !== startedAt || selection.address.toLowerCase() !== expected.toLowerCase())
          throw new Error("Wallet selection changed. Review the action and try again.");
      };
      assertCurrent();
      return assertCurrent;
    },
  };
}
