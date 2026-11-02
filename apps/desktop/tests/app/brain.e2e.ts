import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { launchApp } from "../design/launch.ts";

type Component = { id: string; kind: string; properties: Record<string, { value?: unknown }> };
type EngineState = {
  project: { bodies: { objects: { id: string; components: Component[] }[] }[] };
  revision: { number: number };
};

async function projectState(page: Page): Promise<EngineState> {
  // SAFETY: test-only read of the engine's own answer; the assertions below check the fields used.
  return (await page.evaluate(async () => {
    const status = await window.icarus.engine.status();
    if (status.kind !== "ready") {
      throw new Error("engine not ready");
    }
    const [first] = (await (await fetch(`${status.url}/projects`)).json()) as { id: string }[];
    return (await fetch(`${status.url}/projects/${first?.id}`)).json();
  })) as EngineState;
}

function rays(state: EngineState): Component[] {
  const car = state.project.bodies.flatMap((body) => body.objects).find((obj) => obj.id === "car");
  return car?.components.filter((component) => component.kind === "distance_ray") ?? [];
}

test("the brain adds, renames and removes a distance ray through the engine", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects });
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    await page.locator('[data-cta^="parking-car"]').first().click();
    await page.locator('[data-cta="car"]').first().waitFor({ timeout: 60_000 });
    await page.locator('[data-ui-id="HDR-WORKSPACE"] [data-cta="brain"]').first().click();

    const panel = page.locator('[data-ui-id="PNL-SENSES-ACTIONS"]');
    await expect(panel.locator('input[aria-label="Rename Front"]')).toBeVisible({ timeout: 60_000 });
    const start = (await projectState(page)).revision.number;

    await page.locator('[data-cta="add-a-sensor-input"]').first().click();
    await expect.poll(async () => rays(await projectState(page)).length).toBe(2);
    const added = panel.locator('input[aria-label="Rename Ray 2"]');
    await expect(added).toBeVisible();

    await added.fill("Rear");
    await added.press("Enter");
    await expect.poll(async () => rays(await projectState(page))[1]?.properties.name?.value).toBe("Rear");
    await expect(panel.locator('input[aria-label="Rename Rear"]')).toBeVisible();

    await panel.locator('[data-cta="remove-rear"]').click();
    await expect.poll(async () => rays(await projectState(page)).length).toBe(1);
    expect((await projectState(page)).revision.number).toBe(start + 3);
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
  }
});
