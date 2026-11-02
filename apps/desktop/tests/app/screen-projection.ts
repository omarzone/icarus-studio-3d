import type { SceneDescription } from "@icarus/contracts";
import type { Page } from "@playwright/test";
import { sceneBounds, thumbnailCamera } from "../../src/renderer/scene/thumbnail-framing.ts";

export type Vec = [number, number, number];
export type ScreenBox = { x: number; y: number; width: number; height: number };
// Where a camera is and what it looks at, in Three's axes; `fov` is vertical, in degrees.
export type ViewCamera = { position: Vec; target: Vec; fov: number };

// The viewport's vertical field of view (VIEW_FOV in scene/camera-rig.tsx).
const VIEW_FOV = 45;

// Screen point of a Three world point seen by `camera` in the canvas at `box` (Three's default "up" is +y).
export function project(point: Vec, box: ScreenBox, camera: ViewCamera): { x: number; y: number } {
  const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Vec, b: Vec): Vec => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm = (a: Vec): Vec => {
    const length = Math.hypot(...a);
    return [a[0] / length, a[1] / length, a[2] / length];
  };
  const forward = norm(sub(camera.target, camera.position));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const relative = sub(point, camera.position);
  const depth = dot(relative, forward);
  const scale = 1 / Math.tan((camera.fov * Math.PI) / 360);
  const aspect = box.width / box.height;
  const nx = (dot(relative, right) / depth) * (scale / aspect);
  const ny = (dot(relative, up) / depth) * scale;
  return { x: box.x + ((nx + 1) / 2) * box.width, y: box.y + ((1 - ny) / 2) * box.height };
}

// The project's compiled scene as the engine serves it to the viewport.
export async function engineScene(page: Page, projectId: string): Promise<SceneDescription> {
  const scene = await page.evaluate(async (id) => {
    const status = await window.icarus.engine.status();
    if (status.kind !== "ready") {
      throw new Error("engine not ready");
    }
    return (await fetch(`${status.url}/projects/${id}/scene`)).json();
  }, projectId);
  if (!Array.isArray(scene?.geoms) || !Array.isArray(scene?.bodies)) {
    throw new Error("the engine answered without a scene");
  }
  // SAFETY: test-only read of the engine's own answer; geoms and bodies were checked above.
  return scene as SceneDescription;
}

// Asks the viewport to frame everything as a person does (Camera → Frame all, which also leaves Follow for Free),
// then returns the canvas and the camera it framed the scene with, computed by the app's own framing.
export async function frameAll(page: Page, scene: SceneDescription): Promise<{ box: ScreenBox; camera: ViewCamera }> {
  await page.locator('[data-cta="camera"]').first().click();
  await page.locator('[role="menu"] [data-cta="frame-all"]').click();
  await page.locator('[role="menu"]').waitFor({ state: "detached" });
  // The new camera reaches picking with the next rendered frames.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(undefined)))),
  );
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) {
    throw new Error("no 3D view");
  }
  const camera = thumbnailCamera(sceneBounds(scene.geoms, scene.zones ?? []), box.width / box.height, VIEW_FOV);
  return { box, camera };
}

// The tag of what a click at this screen point lands on, so a card drawn over the 3D view fails readably.
export async function elementAt(page: Page, at: { x: number; y: number }): Promise<string> {
  return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? "", at);
}
