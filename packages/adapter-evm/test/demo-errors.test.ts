import { describe, expect, it } from "vitest";
import { friendlyError } from "../src/errors";
describe("demo transaction recovery", () => {
  it.each([
    "The receipt does not confirm the reviewed stock trade. Check wallet activity before retrying.",
    "Transaction receipt identity is unavailable.",
    "timeout waiting for transaction",
  ])("preserves uncertain-transaction recovery: %s", (message) => {
    expect(friendlyError(new Error(message))).toContain("wallet activity before retrying");
  });
  it("distinguishes an expired quote from a failed transaction", () => {
    expect(friendlyError(new Error("This trade quote expired. Review a new quote."))).toBe(
      "This quote expired. Review a new quote.",
    );
  });
  it("identifies spending-limit and inventory failures", () => {
    expect(friendlyError(new Error("The price moved beyond your reviewed limit."))).toContain("Review a new quote");
    expect(friendlyError(new Error("Demo trading inventory is insufficient"))).toContain("smaller amount");
  });
  it("gives specific testnet setup actions", () => {
    expect(friendlyError(new Error("Add Base Sepolia test ETH to pay the transaction fee."))).toContain("test ETH");
    expect(friendlyError(new Error("Your test-token balance is insufficient"))).toContain("faucet");
    expect(friendlyError(new Error("Demo trading is being prepared."))).toContain("prepared");
  });
});
