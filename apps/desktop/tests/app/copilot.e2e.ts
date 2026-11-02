import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp } from "../design/launch.ts";

test("sprint 6 demo: three ideas, build one, ask for night, apply the proposal", async () => {
  const folders = ["projects", "runs", "settings"].map((name) => mkdtempSync(join(tmpdir(), `icarus-${name}-`)));
  const [projects = "", runs = "", settings = ""] = folders;
  const { app, page } = await launchApp({
    ICARUS_PROJECTS_DIR: projects,
    ICARUS_RUNS_DIR: runs,
    ICARUS_SETTINGS_DIR: settings,
    ICARUS_COPILOT_PROVIDER: "fake",
  });
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    const prompt = page.locator('input[aria-label="Describe what to make"]');
    await prompt.fill("a little car that learns to park itself");
    await prompt.press("Enter");

    await page.waitForSelector('[data-route-screen="SCR-IDEAS"]');
    await expect(page.locator("article[aria-label]")).toHaveCount(3, { timeout: 60_000 });
    await expect(page.locator('article[aria-label="Back into the bay"]')).toBeVisible();
    await page.locator('article[aria-label="Back into the bay"] [data-cta="use-this"]').click();

    await page.waitForSelector('[data-route-screen="SCR-WORLD"]', { timeout: 120_000 });
    await expect(page.locator('[data-cta^="bay-wall"]').first()).toBeVisible({ timeout: 60_000 });

    const composer = page.locator('input[aria-label="Message the copilot"]');
    await composer.fill("make it night");
    await composer.press("Enter");
    await expect(page.getByText("Make it night").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Preview of revision/).first()).toBeVisible();
    await page.locator('[data-cta="apply"]').first().click();
    await expect(page.getByText(/Preview of revision/)).toHaveCount(0, { timeout: 30_000 });

    await page.locator('[data-cta="history"]').first().click();
    const history = page.locator('[data-route-overlay="MOD-HISTORY"]');
    await expect(history.getByText("Make it night").first()).toBeVisible({ timeout: 30_000 });
    await expect(history.getByText(/by copilot/).first()).toBeVisible();
  } finally {
    await app.close();
    for (const folder of folders) {
      rmSync(folder, { recursive: true, force: true });
    }
  }
});
