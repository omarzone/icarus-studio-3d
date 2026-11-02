import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { toThreePosition } from "../../src/renderer/scene/coordinates.ts";
import { launchApp } from "../design/launch.ts";
import { engineScene, frameAll, project } from "./screen-projection.ts";

type EngineObject = {
  id: string;
  name: string;
  parent: string | null;
  components: { kind: string; properties: Record<string, { value?: unknown }> }[];
};
type EngineState = { project: { world: { objects: EngineObject[] } }; revision: { number: number } };

async function projectState(page: Page, id: string): Promise<EngineState> {
  return page.evaluate(async (projectId) => {
    const status = await window.icarus.engine.status();
    if (status.kind !== "ready") {
      throw new Error("engine not ready");
    }
    // SAFETY: test-only read of the engine's own answer; the assertions check the fields used.
    return (await (await fetch(`${status.url}/projects/${projectId}`)).json()) as EngineState;
  }, id);
}

function objectOf(state: EngineState, id: string): EngineObject | undefined {
  return state.project.world.objects.find((item) => item.id === id);
}

function transformOf(state: EngineState, id: string, property: string): unknown {
  return objectOf(state, id)?.components.find((item) => item.kind === "transform")?.properties[property]?.value;
}

// A painted bay line of the parking template: static, so turning or stretching it never upsets the physics checks.
const LINE = "bay_line_2";

test("rotate and scale gizmos, and the explorer's object menu and drag to reparent", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects });
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    await page.locator('[data-cta^="parking-car"]').first().click();
    await page.locator('[data-cta="car"]').first().waitFor({ timeout: 60_000 });
    const id = await page.evaluate(async () => {
      const status = await window.icarus.engine.status();
      const list: { id: string }[] =
        status.kind === "ready" ? await (await fetch(`${status.url}/projects`)).json() : [];
      return list[0]?.id ?? "";
    });
    const revision = async () => (await projectState(page, id)).revision.number;
    const tree = page.locator('[role="tree"]');
    await tree.locator('[data-cta="bay-line-3"]').click();
    const start = await revision();

    const scene = await engineScene(page, id);
    const line = scene.bodies.find((body) => body.name === LINE);
    if (!line) {
      throw new Error("no bay line in the scene");
    }
    const { box, camera } = await frameAll(page, scene);
    const anchor = toThreePosition(line.position);
    const center = project(anchor, box, camera);
    const drag = async (from: { x: number; y: number }, dx: number, dy: number) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 5 });
      await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });
      await page.mouse.up();
    };

    // The scale gizmo's X handle: the gizmo keeps one size on screen (about 75 px from its centre to the uniform
    // handle at the end of an axis), so the X stretch handle sits some 45 px along the X axis' direction.
    const along = project([anchor[0] + 1, anchor[1], anchor[2]], box, camera);
    const length = Math.hypot(along.x - center.x, along.y - center.y);
    const handle = {
      x: center.x + ((along.x - center.x) / length) * 45,
      y: center.y + ((along.y - center.y) / length) * 45,
    };
    const toolbar = page.locator('[role="toolbar"]');
    await toolbar.locator('[data-cta="scale"]').click();
    await expect(toolbar.locator('[data-cta="scale"]')).toHaveAttribute("aria-current", "true");
    await drag(handle, (handle.x - center.x) * 0.6, (handle.y - center.y) * 0.6);
    await expect.poll(revision).toBe(start + 1);
    const scale = transformOf(await projectState(page, id), LINE, "scale");
    if (!Array.isArray(scale)) {
      throw new Error("no scale on the line");
    }
    // Stretched along its own X only.
    expect(scale[0]).toBeGreaterThan(1.2);
    expect(scale.slice(1)).toEqual([1, 1]);

    // E in the 3D view picks Rotate, as the toolbar shows.
    await page.locator('[aria-label^="3D view, press F"]').first().focus();
    await page.keyboard.press("e");
    await expect(toolbar.locator('[data-cta="rotate"]')).toHaveAttribute("aria-current", "true");
    await drag(center, 40, 25);
    await expect.poll(revision).toBe(start + 2);
    expect(transformOf(await projectState(page, id), LINE, "rotation")).not.toEqual([0, 0, 0]);
    await page.screenshot({ path: test.info().outputPath("rotate-gizmo.png") });

    await tree.locator('[data-cta="bay-line-3"]').click({ button: "right" });
    const menu = page.locator('[role="menu"][aria-label="Bay line 3 actions"]');
    await menu.waitFor();
    await page.screenshot({ path: test.info().outputPath("explorer-menu.png") });
    await menu.locator('[data-cta="duplicate"]').click();
    const copy = `${LINE}_copy`;
    await expect.poll(async () => objectOf(await projectState(page, id), copy)?.name).toBe("Bay line 3 copy");

    await tree.locator('[data-cta="bay-line-3-copy"]').click({ button: "right" });
    await page.locator('[role="menu"] [data-cta="rename"]').click();
    const field = tree.locator('input[data-cta="object-name"]');
    await field.fill("Extra line");
    await field.press("Enter");
    await expect.poll(async () => objectOf(await projectState(page, id), copy)?.name).toBe("Extra line");

    // A hidden window runs no native drag loop, so the drag's events are sent to the rows directly.
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await tree.locator('[data-cta="extra-line"]').dispatchEvent("dragstart", { dataTransfer });
    await tree.locator('[data-cta="bay-line-4"]').dispatchEvent("dragover", { dataTransfer });
    await tree.locator('[data-cta="bay-line-4"]').dispatchEvent("drop", { dataTransfer });
    await expect.poll(async () => objectOf(await projectState(page, id), copy)?.parent).toBe("bay_line_3");
    await page.screenshot({ path: test.info().outputPath("explorer-reparented.png") });

    await tree.locator('[data-cta="extra-line"]').click({ button: "right" });
    await page.locator('[role="menu"] [data-cta="delete"]').click();
    await expect.poll(async () => objectOf(await projectState(page, id), copy)).toBeUndefined();
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
  }
});
