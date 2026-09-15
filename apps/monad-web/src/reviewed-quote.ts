/** Use the reviewed quote's expiry for both validation and the on-chain deadline. */
export function reviewedQuoteDeadline(expiresAt: unknown, now = Date.now()) {
  if (
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    expiresAt > now + 10 * 60 * 1000
  )
    throw new Error("Invalid quote expiry. Wait for a fresh quote.");
  if (expiresAt <= now) throw new Error("Quote expired. Wait for a fresh quote.");
  return BigInt(Math.floor(expiresAt / 1000));
}
