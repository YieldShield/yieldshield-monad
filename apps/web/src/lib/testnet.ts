/** Official Coinbase faucet portal, linked from its Base Sepolia faucet documentation. */
export const TEST_ETH_FAUCET_URL = "https://portal.cdp.coinbase.com/products/faucet";
export type WalletFaucetStatus = {
  address: string;
  recipient: string;
  chainId: number;
  evaluatedAt: number;
  validUntil: number;
  nativeBalance: bigint;
  configured: boolean;
  ready: boolean;
  tokens: Array<{
    address: string;
    enabled: boolean;
    funded: boolean;
    canDrip: boolean;
    dripAmount: bigint;
    faucetBalance: bigint;
    nextDripTime: number;
  }>;
};
export type PublicFaucetStatus = { verified: boolean; address: string | null; configured: boolean; ready: boolean };
/** Resolve public configuration before funding or account-specific eligibility. */
export function faucetTokenLabel({
  verifiedFresh,
  enabled,
  funded,
  connected,
  personal,
  now,
}: {
  verifiedFresh: boolean;
  enabled: boolean | null;
  funded: boolean | null;
  connected: boolean;
  personal?: Pick<WalletFaucetStatus["tokens"][number], "canDrip" | "nextDripTime">;
  now: number;
}): string {
  if (!verifiedFresh) return "Checking";
  if (enabled === false) return "Not configured";
  if (enabled === null || funded === null) return "Checking";
  if (!funded) return "Awaiting top-up";
  if (personal?.nextDripTime && personal.nextDripTime > now) return "On cooldown";
  if (personal?.canDrip) return "Available";
  return connected ? "Checking eligibility" : "Connect to check";
}

export type FaucetAction = {
  kind: "connect" | "setup" | "unknown" | "empty" | "gas" | "cooldown" | "ready";
  title: string;
  description: string;
  canRequest: boolean;
  nextClaimAt?: number;
};
export function faucetAction({
  recipient,
  enabled,
  address,
  publicStatus,
  publicFresh,
  wallet,
  now,
}: {
  recipient: string | null;
  enabled: boolean;
  address?: string;
  publicStatus?: PublicFaucetStatus;
  publicFresh: boolean;
  wallet?: WalletFaucetStatus;
  now: number;
}): FaucetAction {
  const blocked = (kind: FaucetAction["kind"], title: string, description: string): FaucetAction => ({
    kind,
    title,
    description,
    canRequest: false,
  });
  if (!recipient) {
    if (publicFresh && publicStatus?.verified && !publicStatus.configured)
      return blocked(
        "connect",
        "Test tokens are being prepared",
        "You can connect your wallet and get test ETH while dispenser setup finishes.",
      );
    return blocked("connect", "Connect your wallet", "Choose the wallet that will receive your test tokens.");
  }
  if (!publicFresh || !publicStatus?.verified)
    return blocked(
      "unknown",
      "Checking token availability",
      "We need a fresh availability check before requesting tokens.",
    );
  if (!enabled || !address || !publicStatus.configured)
    return blocked(
      "setup",
      "Test tokens are being prepared",
      "The dispenser is not ready yet. You can connect your wallet and get test ETH now.",
    );
  if (address.toLowerCase() !== publicStatus.address?.toLowerCase())
    return blocked("unknown", "Token dispenser could not be verified", "Refresh availability before trying again.");
  if (
    !wallet ||
    wallet.chainId !== 84532 ||
    wallet.address.toLowerCase() !== address.toLowerCase() ||
    wallet.recipient.toLowerCase() !== recipient.toLowerCase() ||
    !Number.isFinite(wallet.evaluatedAt) ||
    wallet.evaluatedAt > now ||
    !Number.isFinite(wallet.validUntil) ||
    wallet.validUntil <= now ||
    wallet.validUntil <= wallet.evaluatedAt ||
    wallet.validUntil - wallet.evaluatedAt > 20
  )
    return blocked(
      "unknown",
      "Checking your wallet’s eligibility",
      "Refresh to check your balance and claim availability.",
    );
  if (!wallet.configured)
    return blocked("setup", "Test tokens are being prepared", "The dispenser has not been configured yet.");
  const funded = wallet.tokens.filter(
    (token) => token.enabled && token.funded && token.dripAmount > 0n && token.faucetBalance >= token.dripAmount,
  );
  if (!funded.length)
    return blocked(
      "empty",
      "Waiting for a token top-up",
      "The dispenser needs more test tokens. Refresh later; no wallet transaction is needed now.",
    );
  const eligible = funded.filter((token) => token.canDrip && token.nextDripTime === 0);
  if (!eligible.length) {
    const cooldowns = funded.map((token) => token.nextDripTime).filter((time) => Number.isFinite(time) && time > now);
    if (cooldowns.length)
      return {
        ...blocked(
          "cooldown",
          "Tokens already claimed",
          "Each token can be claimed once every 24 hours. Your existing tokens are still available to use.",
        ),
        nextClaimAt: Math.min(...cooldowns),
      };
    return blocked("unknown", "Claim availability changed", "Refresh before requesting tokens.");
  }
  if (wallet.nativeBalance <= 0n)
    return blocked(
      "gas",
      "Get a little test ETH first",
      "Base Sepolia test ETH pays the network fee for your token request.",
    );
  return {
    kind: "ready",
    title: "Your test tokens are ready",
    description: `Request ${eligible.length === wallet.tokens.length ? "the available basket" : "the tokens currently available to your wallet"} in one wallet transaction.`,
    canRequest: true,
  };
}
