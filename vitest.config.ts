import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) } },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**", "templates/**"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
