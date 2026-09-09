import { describe, expect, it } from "vitest";
import { friendlyError } from "../../../packages/adapter-solana/src/errors";

describe("friendlyError", () => {
  it("maps known errors to calm copy", () => {
    expect(friendlyError(new Error("User rejected the request"))).toBe("You cancelled the signature.");
    expect(
      friendlyError(new Error("Attempt to debit an account but found no record of a prior insufficient lamports")),
    ).toBe("Not enough SOL to cover the network fee.");
    expect(friendlyError(new Error("custom program error: 0x1771"))).toMatch(/Couldn't complete/);
    expect(friendlyError(new Error("Blockhash not found"))).toMatch(/network was busy/);
  });

  it("falls back for unknown errors", () => {
    expect(friendlyError("weird thing")).toBe("Something went wrong — please try again.");
  });
});
