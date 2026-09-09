/**
 * Product vocabulary — the single place raw protocol terms become user language.
 *
 * The SDK exposes raw + derived protocol data (Shield/Protector/commission/oracle/rent); the UI must
 * NEVER show those. Everything user-facing routes through here. See the glossary in
 * local-docs/design_handoff_yieldshield/README.md.
 */
export const VOCAB = {
  appName: "YieldShield",
  tagline: "Protect your stocks on Base.",

  // Sides of the pool
  saver: "Test protection",
  saverShort: "Protected",
  protector: "Provide collateral",
  protectorEarning: "Collateral position",
  backingSavers: "Backing test positions",

  // Actions
  addMoney: "Get protection",
  startSaving: "Try test protection",
  activate: "Exit with protection",
  activateSub: "Close your position for USDC",
  provide: "Provide collateral",
  collect: "Collect",
  withdraw: "Withdraw",

  // Economics
  premium: "Premium",
  protectedApy: "Variable outcome",
  premiumApy: "Variable premium",
  netApy: "Variable outcome",
  coverage: "Coverage",
  backedAt: (pct: string) => `Backed at ${pct}`,
  capacity: "Pool capacity",
  noticePeriod: "Pool withdrawal notice",

  // Safety / chain
  pricesHealthy: "Opening prices available",
  pausedForSafety: "New positions paused — check market hours and oracle status",
  pausedShort: "New positions paused",
  unavailable: "Temporarily unavailable",
  governed: "Alpha governance controls apply",
  rentNote: "Small refundable deposit to open this position (returned when you close)",
  position: "Your position",

  // Risk disclosure (protector)
  paidLast: "You're paid last",
  paidLastBody: "In a loss, you absorb losses first.",
} as const;

/** Solana rent, framed for users. */
export const RENT_COPY = VOCAB.rentNote;
