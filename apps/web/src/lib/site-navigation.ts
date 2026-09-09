export const PRIMARY_NAVIGATION = [
  { id: "trade", to: "/trade", label: "Trade", mobileLabel: "Trade" },
  { id: "protection", to: "/markets", label: "Get protection", mobileLabel: "Protect" },
  { id: "positions", to: "/positions", label: "My positions", mobileLabel: "Positions" },
  { id: "collateral", to: "/provide", label: "Provide collateral", mobileLabel: "Collateral" },
  { id: "account", to: "/account", label: "Account", mobileLabel: "Account" },
] as const;

export type NavigationSection = (typeof PRIMARY_NAVIGATION)[number]["id"];

export const UTILITY_NAVIGATION = [
  { to: "/test-tokens", label: "Free test tokens" },
  { to: "/status", label: "Market & oracle status" },
] as const;

export const INFORMATION_NAVIGATION = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/legal", label: "Imprint" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/risks", label: "Risks" },
] as const;
