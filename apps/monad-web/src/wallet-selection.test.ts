import { describe, expect, it, vi } from "vitest";
import { createWalletSelectionGuard } from "./wallet-selection";

const address = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";

describe("wallet selection during a transaction sequence", () => {
  it("does not cancel an action when the same session reports itself again", () => {
    const guard = createWalletSelectionGuard(),
      connector = {};
    guard.select({ address, connector });
    const check = guard.capture(address);
    guard.select({ address, connector });
    expect(check).not.toThrow();
  });

  it.each(["disconnect", "account", "connector", "reconnect"])(
    "prevents the next signature after a %s during an approval",
    async (change) => {
      const guard = createWalletSelectionGuard(),
        connector = {};
      guard.select({ address, connector });
      const check = guard.capture(address);
      const signDeposit = vi.fn();
      let completeApproval!: () => void;
      const approval = new Promise<void>((resolve) => {
        completeApproval = resolve;
      });
      const action = (async () => {
        check();
        await approval;
        check();
        signDeposit();
      })();
      if (change === "disconnect" || change === "reconnect") guard.select(null);
      if (change === "account") guard.select({ address: other, connector });
      if (change === "connector") guard.select({ address, connector: {} });
      if (change === "reconnect") guard.select({ address, connector });
      completeApproval();
      await expect(action).rejects.toThrow(/Connect a wallet|Wallet selection changed/);
      expect(signDeposit).not.toHaveBeenCalled();
      if (change === "reconnect") expect(guard.capture(address)).not.toThrow();
    },
  );

  it("rejects an event handler captured for an earlier account", () => {
    const guard = createWalletSelectionGuard();
    guard.select({ address: other, connector: {} });
    expect(() => guard.capture(address)).toThrow("Wallet selection changed");
  });
});
