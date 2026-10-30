import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/design",
  testMatch: "*.e2e.ts",
  timeout: 180_000,
  workers: 1,
  reporter: "list",
});
