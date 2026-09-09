/** Map raw EVM transaction/wallet errors to calm, plain-language copy (never a raw revert/stack). */
export function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (
    msg.includes("receipt") ||
    msg.includes("check wallet activity") ||
    msg.includes("transaction identity") ||
    msg.includes("confirmation")
  )
    return "Confirmation could not be verified. Check your wallet activity before retrying.";
  if (msg.includes("demo trading is being prepared") || msg.includes("demo trading is not configured"))
    return "Demo trading is being prepared. Refresh shortly.";
  if (msg.includes("quote expired") || msg.includes("quoteexpired")) return "This quote expired. Review a new quote.";
  if (msg.includes("reviewed limit") || msg.includes("slippageexceeded"))
    return "The price moved beyond your limit. Review a new quote.";
  if (msg.includes("inventory") || msg.includes("insufficientinventory"))
    return "There are not enough test tokens available for this trade. Try a smaller amount.";
  if (msg.includes("test eth")) return "Add Base Sepolia test ETH for network fees.";
  if (msg.includes("test-token balance")) return "Not enough test tokens. Reduce the amount or use the faucet.";
  if (
    msg.includes("could not be verified") ||
    msg.includes("reviewed deployment") ||
    msg.includes("configuration differs")
  )
    return "The deployment could not be verified. Refresh before continuing.";
  if (msg.includes("connect a wallet")) return "Connect a wallet to continue.";
  if (msg.includes("wallet account changed")) return "Your wallet account changed. Review the action and start again.";
  if (msg.includes("cancelled or replaced"))
    return "This transaction was cancelled or replaced. Check your wallet activity before trying again.";
  if (msg.includes("minimum output"))
    return "A fresh withdrawal quote is required. Refresh the position and try again.";
  if (msg.includes("data unavailable") || msg.includes("discovery limit") || msg.includes("position discovery"))
    return "On-chain data is unavailable. Refresh before continuing.";
  if (msg.includes("user rejected") || msg.includes("user denied") || msg.includes("rejected the request"))
    return "You cancelled the signature.";
  if (msg.includes("insufficient funds")) return "Not enough ETH to cover the network fee.";
  if (msg.includes("exceeds balance") || msg.includes("insufficient allowance") || msg.includes("insufficient balance"))
    return "Not enough balance for this amount.";
  if (msg.includes("stocktokenoraclepaused") || msg.includes("oraclepaused"))
    return "This market’s price feed is paused. Try again when pricing is available.";
  if (
    msg.includes("staleprice") ||
    msg.includes("pricestale") ||
    msg.includes("priceunavailable") ||
    msg.includes("oraclechallenge") ||
    msg.includes("price feed")
  )
    return "A current, verified price is unavailable. Try again when pricing is restored.";
  if (msg.includes("unlock") || msg.includes("pooltimeminimumnotreached"))
    return "This withdrawal is not available yet. Check the position’s notice period.";
  if (msg.includes("slippage") || msg.includes("minamountout") || msg.includes("minreceived"))
    return "Price moved more than your slippage limit — try again.";
  if (msg.includes("chain mismatch") || msg.includes("wrong network") || msg.includes("switch"))
    return "Your wallet is on a different network — switch and try again.";
  if (msg.includes("timed out") || msg.includes("timeout"))
    return "The network response was delayed. Check your wallet activity before retrying.";
  if (msg.includes("reverted") || msg.includes("execution failed"))
    return "Couldn't complete this right now — please try again.";
  return "Something went wrong — please try again.";
}
