import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Build-time chain selection: VITE_CHAIN_FAMILY ("solana" default | "evm") decides which
  // implementation backs the `@chain-impl` alias, so each deployment bundles exactly one
  // adapter — the other chain's packages (wagmi/viem vs @solana/*) never ship. Read from the
  // process env (Vercel project settings) first, then the mode's .env files (local dev, e.g.
  // `vite --mode robinhood-testnet` → .env.robinhood-testnet).
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "VITE_");
  const family = process.env.VITE_CHAIN_FAMILY ?? env.VITE_CHAIN_FAMILY ?? "evm";
  if (family !== "solana" && family !== "evm") throw new Error(`unknown VITE_CHAIN_FAMILY: ${family}`);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@chain-impl": fileURLToPath(new URL(`./src/chain/impl.${family}.tsx`, import.meta.url)),
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3001" } },
    build: {
      chunkSizeWarningLimit: 900,
    },
  };
});
