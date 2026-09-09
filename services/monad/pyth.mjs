/** Public signed payload validation; API credentials stay in the caller's server environment. */
export function validatePythUpdate(update, feedId, now = Date.now()) {
  const feed = update.parsed?.find(
    (p) => p.id?.toLowerCase().replace(/^0x/, "") === feedId.toLowerCase().replace(/^0x/, ""),
  );
  const price = feed?.price;
  if (
    !price ||
    !/^\d+$/.test(String(price.price)) ||
    BigInt(price.price) <= 0n ||
    !Number.isInteger(price.publish_time) ||
    now / 1000 - price.publish_time > 90 ||
    price.publish_time > now / 1000 + 5 ||
    update.binary?.encoding !== "hex" ||
    !Array.isArray(update.binary.data) ||
    !update.binary.data.length ||
    update.binary.data.length > 4 ||
    update.binary.data.some((d) => typeof d !== "string" || !/^(?:[a-fA-F0-9]{2})+$/.test(d) || d.length > 200000)
  )
    throw new Error("Invalid or stale signed Pyth update");
  return { updateData: update.binary.data.map((d) => "0x" + d), price };
}
export async function fetchPythUpdate(apiKey, feedId) {
  if (!apiKey) throw new Error("Pyth account setup is pending. Reference actions require fresh signed prices.");
  const response = await fetch(`https://pyth.dourolabs.app/hermes/v2/updates/price/latest?ids%5B%5D=${feedId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Pyth update service unavailable (${response.status})`);
  return validatePythUpdate(await response.json(), feedId);
}
