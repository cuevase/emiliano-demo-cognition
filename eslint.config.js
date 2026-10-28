import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Guardrails for tools: no raw database access, no privileged connections.
const toolGuardrails = {
  "no-restricted-imports": ["error", {
    paths: [
      { name: "pg", message: "Use @platform/db (withTx via platform.as / defineAction) so RLS context is set." },
      { name: "@neondatabase/serverless", message: "Use @platform/db." },
    ],
  }],
  "no-restricted-syntax": ["error",
    { selector: "ImportSpecifier[imported.name='withSystemTx']", message: "withSystemTx bypasses user context. Platform-internal only." },
    { selector: "ImportSpecifier[imported.name='writeAuditEvent']", message: "Tools get audit from defineAction; don't write audit events by hand." },
  ],
};

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/next-env.d.ts", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Guardrails for tools: no raw database access, no privileged connections.
    files: ["apps/**/*.{ts,tsx}", "templates/**/*.{ts,tsx}"],
    rules: toolGuardrails,
  },
  {
    // The console is the platform's own UI and may record platform audit events.
    files: ["apps/console/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Tools mounted in the console keep the tool guardrails.
    files: ["apps/console/tools/**/*.{ts,tsx}", "apps/console/app/t/**/*.{ts,tsx}"],
    rules: toolGuardrails,
  },
);
