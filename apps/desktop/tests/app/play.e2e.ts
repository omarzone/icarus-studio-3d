import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { launchApp } from "../design/launch.ts";
import { project } from "./screen-projection.ts";

// The straight-ahead ray of the parking car, as the senses panel shows it.
async function frontDistance(page: Page): Promise<number> {
  const text = await page.locator("body").innerText();
  const match = /Car distance 3\s*\n?\s*([\d.]+)\s*m/.exec(text);
  return match ? Number(match[1]) : Number.NaN;
}

// React Three Fiber finds what is under the pointer on move, so a click comes after a hover, as a person's does.
async function clickWorld(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.mouse.up();
}

test("sprint 4 demo: play the parking car, add a box in front, push it, reset", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects });
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    await page.locator('[data-cta^="parking-car"]').first().click();
    await page.locator('[data-cta="car"]').first().waitFor({ timeout: 60_000 });

    await page.locator('[data-ui-id="HDR-WORKSPACE"] [data-cta="play"]').click();
    await page.waitForSelector('[data-route-screen="SCR-PLAY"]');
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => frontDistance(page), { timeout: 30_000 }).toBeGreaterThan(5);
    for (const ray of [1, 2, 3, 4, 5]) {
      await expect(page.getByText(`Car distance ${ray}`).first()).toBeVisible();
    }

    await page.locator('[data-cta="add-object"]').first().click();
    const view = await page.locator("canvas").first().boundingBox();
    if (!view) {
      throw new Error("no Play viewport");
    }
    // Turning the camera with a tool selected must not use the tool.
    const from = project([-3, 0, 4], view);
    await page.mouse.move(from.x, from.y);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.mouse.move(from.x + 120, from.y + 10, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/You added/)).toHaveCount(0);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 120, from.y - 10, { steps: 8 });
    await page.mouse.up();

    const ahead = project([3.5, 0, 0], view);
    await clickWorld(page, ahead);
    await expect(page.getByText(/You added Box/).first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => frontDistance(page), { timeout: 15_000 }).toBeLessThan(5);

    await page.locator('[data-cta="push"]').first().click();
    const box = project([3.75, 0.25, 0], view);
    await clickWorld(page, box);
    await expect(page.getByText(/You pushed/).first()).toBeVisible({ timeout: 15_000 });

    await page.locator('[data-cta="reset"]').first().click();
    await expect(page.getByText("Episode reset").first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
  }
});
