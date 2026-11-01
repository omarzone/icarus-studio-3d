import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { launchApp } from "../design/launch.ts";

type Component = { kind: string; properties: Record<string, { value?: unknown }> };
type EngineProject = {
  id: string;
  name: string;
  bodies: { objects: { id: string; components: Component[] }[] }[];
};
type EngineState = { project: EngineProject; revision: { number: number } };

async function engine(page: Page, path: string): Promise<unknown> {
  return page.evaluate(async (route) => {
    const status = await window.icarus.engine.status();
    if (status.kind !== "ready") {
      throw new Error("engine not ready");
    }
    return (await fetch(`${status.url}${route}`)).json();
  }, path);
}

async function projectState(page: Page, id: string): Promise<EngineState> {
  // SAFETY: test-only read of the engine's own answer; the assertions below check the fields used.
  return (await engine(page, `/projects/${id}`)) as EngineState;
}

function component(state: EngineState, objectId: string, kind: string): Component | undefined {
  const obj = state.project.bodies.flatMap((body) => body.objects).find((item) => item.id === objectId);
  return obj?.components.find((item) => item.kind === kind);
}

test("sprint 3 demo: template, edit, add component, undo, rename, duplicate", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects });
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    await page.locator('[data-cta^="parking-car"]').first().click();

    await page.locator('[data-cta="car"]').first().waitFor({ timeout: 60_000 });
    const id = await page.evaluate(async () => {
      const status = await window.icarus.engine.status();
      if (status.kind !== "ready") {
        return "";
      }
      const list: { id: string }[] = await (await fetch(`${status.url}/projects`)).json();
      return list[0]?.id ?? "";
    });
    expect(id).toMatch(/^[0-9a-f]{12}$/);

    await page.locator('[data-cta="car"]').first().click();
    const thumb = page.locator('[role="slider"][aria-label="Friction"]').first();
    await thumb.waitFor();
    const track = thumb.locator("xpath=..");
    await track.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    if (!box) {
      throw new Error("no friction track");
    }
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
    await expect
      .poll(async () => component(await projectState(page, id), "car", "collider")?.properties.friction?.value)
      .toBeCloseTo(1.5, 1);

    await page.locator('[data-cta="add-component"]').first().click();
    await page.locator('[role="dialog"][aria-label="Add component"] [data-cta="touch"]').click();
    await expect.poll(async () => component(await projectState(page, id), "car", "touch")).toBeDefined();
    const withTouch = (await projectState(page, id)).revision.number;

    await page.locator("body").click({ position: { x: 5, y: 600 } });
    await page.keyboard.press("Control+z");
    await expect.poll(async () => component(await projectState(page, id), "car", "touch")).toBeUndefined();
    expect((await projectState(page, id)).revision.number).toBeLessThan(withTouch);

    await expect(page.locator("canvas").first()).toBeVisible();

    await page.locator('[data-ui-id="HDR-WORKSPACE"] [data-cta^="parking"]').first().click();
    await page.locator('[role="dialog"] [data-cta="rename"], [data-cta="rename"]').first().click();
    const name = page.locator('[role="dialog"] input').first();
    await name.fill("Lot");
    await page.locator('[role="dialog"] [data-cta="save"]').click();
    await expect.poll(async () => (await projectState(page, id)).project.name).toBe("Lot");

    await page.locator('[data-ui-id="HDR-WORKSPACE"] [data-cta="lot"]').first().click();
    await page.locator('[data-cta="duplicate"]').first().click();
    await page.locator('[role="dialog"] input').first().fill("Lot copy");
    await page.locator('[role="dialog"] [data-cta="duplicate"]').click();
    await expect
      .poll(async () => ((await engine(page, "/projects")) as { name: string }[]).map((item) => item.name).sort())
      .toEqual(["Lot", "Lot copy"]);
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
  }
});
