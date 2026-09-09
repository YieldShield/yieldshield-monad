import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config for the workspace. Type-aware linting is intentionally off (fast, no project
 * service) — typecheck is a separate gate (`tsc --noEmit`). Generated clients + build output are
 * ignored.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/src/generated/**", "**/idl/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Node-run code: dev scripts, tests, and config files.
    files: ["**/scripts/**", "**/test/**", "**/*.mjs", "**/*.config.{js,ts,mjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
