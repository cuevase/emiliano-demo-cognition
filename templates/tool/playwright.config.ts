import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:__PORT__" },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "pnpm start", port: __PORT__, reuseExistingServer: true },
});
