import { defineConfig } from "@playwright/test";

// The app against the real local engine: slower than the design suite and run on its own.
export default defineConfig({
  testDir: "tests/app",
  testMatch: "*.e2e.ts",
  timeout: 300_000,
  workers: 1,
  reporter: "list",
});
