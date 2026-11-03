import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { launchApp } from "../design/launch.ts";
import { engineScene } from "./screen-projection.ts";

type EngineObject = { id: string; components: { kind: string; properties: Record<string, { value?: unknown }> }[] };
type EngineState = { project: { world: { objects: EngineObject[] } } };

async function engine(page: Page, path: string, body?: unknown): Promise<unknown> {
  return page.evaluate(
    async ({ path, body }) => {
      const status = await window.icarus.engine.status();
      if (status.kind !== "ready") {
        throw new Error("engine not ready");
      }
      const init = body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {};
      const response = await fetch(`${status.url}${path}`, init);
      if (!response.ok) {
        throw new Error(`${path}: ${response.status} ${await response.text()}`);
      }
      return response.json();
    },
    { path, body },
  );
}

async function objects(page: Page, id: string): Promise<EngineObject[]> {
  return ((await engine(page, `/projects/${id}`)) as EngineState).project.world.objects;
}

const vector = (value: number[]) => ({ type: "vector", value });

const set = (object: string, component: string, property: string, value: unknown) => ({
  op: "set_property",
  object,
  component,
  property,
  value,
});

// A static part of the scene built for the picture: shape, size, place and color.
function part(id: string, shape: string, size: number[], position: number[], color: string) {
  return {
    op: "create_object",
    target: "world",
    object: {
      id,
      name: id,
      parent: null,
      components: [
        { id: "transform", kind: "transform", properties: { position: vector(position) } },
        { id: "mesh", kind: "mesh", properties: { shape: { type: "list", value: shape }, size: vector(size) } },
        { id: "material", kind: "material", properties: { color: { type: "color", value: color } } },
        { id: "physics_body", kind: "physics_body", properties: { mode: { type: "choice", value: "static" } } },
        { id: "collider", kind: "collider", properties: {} },
      ],
    },
  };
}

const material = (id: string, preset: string) => set(id, "material", "preset", { type: "list", value: preset });

test("insert parts from the toolbar, pick a palette material and draw a scene built from parts", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects });
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    await page.locator('[data-cta^="empty-world"]').first().click();
    await page.locator('[role="tree"]').first().waitFor({ timeout: 60_000 });
    const list = (await engine(page, "/projects")) as { id: string }[];
    const id = list[0]?.id ?? "";

    // A small scene of parts in several materials on a studded grass slab, made through the engine.
    await engine(page, `/projects/${id}/operations`, {
      summary: "A scene of parts",
      operations: [
        part("base", "box", [6, 4, 1], [0, 0, 0.5], "#8a8f98"),
        part("tower", "cylinder", [1.5, 1.5, 3], [-2, 0, 2.5], "#d6d3cd"),
        part("roof", "corner_wedge", [2, 2, 1.5], [1.5, 0.8, 1.75], "#b5654a"),
        part("orb", "sphere", [1.2, 1.2, 1.2], [1, -1, 1.6], "#3ec7ff"),
        part("pane", "box", [0.2, 3, 2], [2.9, 0, 2], "#9fd3ff"),
        part("pad", "box", [4, 4, 0.2], [-5, -4, 0.1], "#cfe8f5"),
        part("pill", "capsule", [0.8, 0.8, 2], [-4.5, 2.5, 1], "#46a758"),
        material("base", "diamond_plate"),
        material("tower", "marble"),
        material("roof", "brick"),
        material("orb", "neon"),
        material("pane", "glass"),
        material("pad", "ice"),
        material("pill", "plastic"),
        material("ground", "grass"),
        set("ground", "material", "color", { type: "color", value: "#5c8a3c" }),
        set("ground", "ground", "decal", { type: "choice", value: "studs" }),
      ],
    });
    const scene = await engineScene(page, id);
    expect(scene.geoms.find((geom) => geom.name === "roof")?.shape).toBe("corner_wedge");
    expect(scene.geoms.find((geom) => geom.name === "orb")?.material).toBe("neon");

    // The toolbar's Part menu inserts a wedge at the middle of the view and selects it.
    await page.locator('[data-cta="part"]').click();
    await page.locator('[role="menu"] [data-cta="wedge"]').click();
    await expect.poll(async () => (await objects(page, id)).map((obj) => obj.id)).toContain("wedge");

    // Made into a ramp up to the base, then the inspector's palette makes it wood planks, which sets its grip.
    await engine(page, `/projects/${id}/operations`, {
      summary: "A ramp",
      operations: [
        set("wedge", "transform", "position", vector([0, -3.5, 0.5])),
        set("wedge", "transform", "rotation", vector([0, 0, 180])),
        set("wedge", "mesh", "size", vector([6, 3, 1])),
      ],
    });
    await page.locator('[data-cta="material"][aria-haspopup="dialog"]').first().click();
    await page.locator('[role="dialog"] [data-cta="material-wood-planks"]').click();
    await expect
      .poll(async () => {
        const wedge = (await objects(page, id)).find((obj) => obj.id === "wedge");
        return wedge?.components.find((component) => component.kind === "collider")?.properties.friction?.value;
      })
      .toBe(0.7);

    await page.locator('[aria-label^="3D view"]').first().focus();
    await page.keyboard.press("f");
    await page.waitForTimeout(2000);
    const shot = process.env.ICARUS_PARTS_SHOT;
    if (shot) {
      await page.screenshot({ path: shot });
    }
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
  }
});
