// services/monad/server.mjs retains a completed positions read for five seconds.
// A read already in progress when a transaction confirms can finish afterward,
// so start this wait after that first response, not after the receipt timestamp.
export const POSITION_REFRESH_DELAY_MS = 5250;

export async function refreshConfirmedPositions<T>(
  read: () => Promise<T>,
  publish: (snapshot: T) => Promise<unknown>,
  {
    wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    ancillaryRefresh,
  }: { wait?: (ms: number) => Promise<void>; ancillaryRefresh?: Promise<unknown> } = {},
) {
  // SWR keeps ancillary errors with their own keys. A failed or slow balance,
  // faucet or oracle request must not hide a successfully reconciled position.
  if (ancillaryRefresh) void ancillaryRefresh.catch(() => undefined);
  // If this fails or times out, the server may still have a pre-transaction read
  // in progress. Surface the data delay instead of claiming the cache is fresh.
  await read();
  await wait(POSITION_REFRESH_DELAY_MS);
  const fresh = await read();
  await publish(fresh);
}
