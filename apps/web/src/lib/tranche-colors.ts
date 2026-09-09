/** Role colors: senior protection is purple; junior backing is Base blue. */
export const TRANCHE_COLORS = {
  senior: {
    DEFAULT: "#7954C6",
    bright: "#9773D0",
    dark: "#5E3A9F",
    tint: "#F0EAF8",
    "tint-2": "#F8F5FC",
  },
  junior: {
    DEFAULT: "#0052FF",
    accent: "#0047DE",
    dark: "#003DCC",
    tint: "#EAF0FF",
    "tint-2": "#DCE7FF",
    "tint-3": "#F4F7FF",
  },
} as const;

export type TrancheRole = keyof typeof TRANCHE_COLORS;
