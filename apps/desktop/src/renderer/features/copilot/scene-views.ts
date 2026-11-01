import type { SceneDescription } from "@icarus/contracts";
import { base64OfDataUrl } from "./attachment-rules.ts";

// The pictures of the scene the copilot gets with each message, drawn by the same offscreen renderer as thumbnails.

const VIEWS = [
  { name: "Three-quarter view", view: "three-quarter" },
  { name: "Top view", view: "top" },
] as const;

const WIDTH = 768;
const HEIGHT = 480;

export type SceneShot = { name: string; data: string };

export async function captureSceneViews(description: SceneDescription): Promise<SceneShot[]> {
  if (description.geoms.length === 0) {
    return [];
  }
  const { renderSceneView } = await import("../../scene/thumbnail-renderer.ts");
  return VIEWS.map(({ name, view }) => ({
    name,
    data: base64OfDataUrl(renderSceneView(description, { view, width: WIDTH, height: HEIGHT, type: "image/jpeg" })),
  }));
}
