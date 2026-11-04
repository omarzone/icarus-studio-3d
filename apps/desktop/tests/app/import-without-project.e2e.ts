import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp } from "../design/launch.ts";
import { pyramidGlb } from "./model-files.ts";

test("importing a model with no open project creates one named after the file only when confirmed", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const runs = mkdtempSync(join(tmpdir(), "icarus-runs-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects, ICARUS_RUNS_DIR: runs });
  const engine = (path: string) =>
    page.evaluate(async (path) => {
      const status = await window.icarus.engine.status();
      if (status.kind !== "ready") {
        throw new Error("The engine is not ready");
      }
      return (await fetch(`${status.url}${path}`)).json();
    }, path);
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    const dialog = page.getByRole("dialog");

    await page.locator('[data-cta^="import-your-own"]').first().click();
    await dialog.locator('[data-cta="choose-file"]').waitFor({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await engine("/projects")).toEqual([]);

    await page.locator('[data-cta^="import-your-own"]').first().click();
    await dialog
      .locator('input[type="file"]')
      .setInputFiles({ name: "red_pyramid.glb", mimeType: "model/gltf-binary", buffer: pyramidGlb() });
    await expect(dialog.getByText("Ready to import")).toBeVisible();
    await dialog.locator('[data-cta="import-as-static-mesh"]').click();

    await page.waitForSelector('[data-route-screen="SCR-WORLD"]', { timeout: 60_000 });
    await page.locator('[role="tree"] [data-cta="red-pyramid"]').waitFor({ timeout: 60_000 });
    const listed: { id: string; name: string }[] = await engine("/projects");
    expect(listed.map((project) => project.name)).toEqual(["red_pyramid"]);
    const scene = JSON.stringify(await engine(`/projects/${listed[0]?.id}/scene`));
    expect(scene).toContain('"skin":{');
    await page.screenshot({ path: join("test-results", "import-without-project.png") });
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
    rmSync(runs, { recursive: true, force: true });
  }
});
