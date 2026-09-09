/** Map raw Solana transaction/wallet errors to calm, plain-language copy (never a raw revert/stack). */
export function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes("connect a wallet")) return "Connect a wallet to continue.";
  if (msg.includes("user rejected") || msg.includes("rejected the request") || msg.includes("declined"))
    return "You cancelled the signature.";
  if (msg.includes("insufficient") && msg.includes("lamports")) return "Not enough SOL to cover the network fee.";
  if (msg.includes("insufficient")) return "Not enough balance for this amount.";
  if (msg.includes("blockhash") || msg.includes("timed out")) return "The network was busy — please try again.";
  if (msg.includes("already in use") || msg.includes("already initialized")) return "This was already set up.";
  if (msg.includes("0x") || msg.includes("custom program error"))
    return "Couldn't complete this right now — please try again.";
  return "Something went wrong — please try again.";
}
