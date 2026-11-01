import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp } from "../design/launch.ts";

test("sprint 5 demo: train the parking car, watch the copies, replay a checkpoint, stop", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const runs = mkdtempSync(join(tmpdir(), "icarus-runs-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects, ICARUS_RUNS_DIR: runs });
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    await page.locator('[data-cta^="parking-car"]').first().click();
    await page.locator('[data-cta="car"]').first().waitFor({ timeout: 60_000 });

    await page.locator('[data-ui-id="HDR-WORKSPACE"] [data-goes-to="MOD-START-TRAINING"]').click();
    const dialog = page.locator('[data-route-overlay="MOD-START-TRAINING"]');
    await dialog.waitFor();
    const steps = dialog.getByLabel("Practice steps");
    await steps.fill("200000");
    await steps.press("Enter");
    const copies = dialog.getByLabel("Parallel copies");
    await copies.fill("4");
    await copies.press("Enter");
    await dialog.locator('[data-cta="start-run-1"]').click();

    await page.waitForSelector('[data-route-screen="SCR-TRAIN"]', { timeout: 30_000 });
    const live = page.locator('[data-ui-id="TAB-LIVE-TRAINING"]');
    await expect(live.getByRole("status").filter({ hasText: /4 copies/ })).toBeVisible({ timeout: 180_000 });
    await expect(page.locator('[data-ui-id="PNL-METRICS"]').getByText("Mean return").first()).toBeVisible({
      timeout: 120_000,
    });

    await page.getByRole("tab", { name: "Replay" }).click();
    const replay = page.locator('[data-ui-id="TAB-REPLAY"]');
    await expect(replay.getByText(/Checkpoint 25k/).first()).toBeVisible({ timeout: 180_000 });
    await replay.locator('[data-cta="play-the-replay"]').click();
    await expect(replay.locator('[data-cta="pause-the-replay"]')).toBeVisible();

    await page.locator('[data-ui-id="HDR-WORKSPACE"] [data-cta="stop"]').click();
    await page.locator('[data-route-overlay="MOD-STOP-RUN"] [data-cta="stop-run-1"]').click();
    await page.waitForSelector('[data-route-screen="SCR-RESULTS"]', { timeout: 30_000 });
    await page.locator('[data-ui-id="HDR-WORKSPACE"] [data-goes-to="SCR-TRAIN"]').first().click();
    await page.waitForSelector('[data-route-screen="SCR-TRAIN"]');
    await expect(
      page
        .locator('[data-ui-id="PNL-RUNS"]')
        .getByText(/stopped/)
        .first(),
    ).toBeVisible({
      timeout: 120_000,
    });
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
    rmSync(runs, { recursive: true, force: true });
  }
});
