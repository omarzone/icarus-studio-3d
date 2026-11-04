import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { PNG } from "pngjs";
import { launchApp } from "../design/launch.ts";
import { pyramidGlb } from "./model-files.ts";

// Pixels of the viewport painted the model's strong red; the car's red is too orange to count.
async function redPixels(page: Page): Promise<number> {
  const viewport = page.locator("canvas").first();
  const image = PNG.sync.read(await viewport.screenshot());
  let count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const [r = 0, g = 0, b = 0] = image.data.subarray(index, index + 3);
    if (r > 120 && g < 50 && b < 50) {
      count += 1;
    }
  }
  return count;
}

test("an imported model is drawn over its collider in the world viewport", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects });
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    await page.locator('[data-cta^="parking-car"]').first().click();
    await page.locator('[data-cta="car"]').first().waitFor({ timeout: 60_000 });
    const before = await redPixels(page);
    const imported = await page.evaluate(async (data) => {
      const status = await window.icarus.engine.status();
      if (status.kind !== "ready") {
        throw new Error("engine not ready");
      }
      const list: { id: string }[] = await (await fetch(`${status.url}/projects`)).json();
      const id = list[0]?.id ?? "";
      const body = { name: "red_pyramid.glb", data, length: 4, mode: "static", position: [0, 6, 0] };
      const response = await fetch(`${status.url}/projects/${id}/skins`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }, pyramidGlb().toString("base64"));
    expect(imported.status).toBe(201);
    // The revision event refreshes the explorer and the scene; the model then loads and replaces the fallback box.
    await page.locator('[role="tree"] [data-cta="red-pyramid"]').waitFor({ timeout: 60_000 });
    await expect.poll(() => redPixels(page), { timeout: 30_000 }).toBeGreaterThan(before + 200);
    await page.screenshot({ path: test.info().outputPath("skinned-object.png") });
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
  }
});
