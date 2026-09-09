import type { Config } from "tailwindcss";
import { TRANCHE_COLORS } from "./src/lib/tranche-colors";

/** Purple senior protection, blue junior backing, neutral general actions. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E1114",
        body: "#5B6470",
        muted: "#646D79",
        faint: "#A6ADB6",
        hairline: "#ECEEF1",
        "hairline-2": "#E8EAED",
        canvas: "#F4F5F7",
        surface: "#FFFFFF",
        subtle: "#F7F8FA",
        "subtle-2": "#F1F2F5",
        senior: TRANCHE_COLORS.senior,
        junior: TRANCHE_COLORS.junior,
        // Existing component tone names remain compatible with the role palette.
        green: TRANCHE_COLORS.senior,
        indigo: TRANCHE_COLORS.junior,
        amber: {
          DEFAULT: "#B57A1E",
          deep: "#6B5520",
          tint: "#FBF3E2",
          border: "#F0E2C4",
        },
        solana: "#9945FF",
        disabled: "#C2C8D0",
        usdc: { bg: "#F2F5FF", fg: "#2A55E0" },
        jitosol: { bg: "#EAF7F1", fg: "#11A36B" },
        wallet: { phantom: "#5848C7", backpack: "#E33E3F", solflare: "#FFC10A" },
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        chip: "11px",
        input: "14px",
        card: "20px",
        hero: "24px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 8px 24px rgba(16,17,20,.07)",
        panel: "0 10px 30px rgba(16,17,20,.06)",
        welcome: "0 30px 70px rgba(16,17,20,.10)",
        modal: "0 40px 90px rgba(16,40,28,.28)",
      },
      letterSpacing: {
        hero: "-0.024em",
        tight2: "-0.02em",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.34s cubic-bezier(0.22,0.61,0.36,1) both",
        pop: "pop 0.4s cubic-bezier(0.22,0.61,0.36,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
