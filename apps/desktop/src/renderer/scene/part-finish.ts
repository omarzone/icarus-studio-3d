import type { SceneGeom } from "@icarus/contracts";

// How a part's own transparency and reflectance change its material: see-through by its transparency, and mirroring
// the sky's environment (with a smoother face) by its reflectance. Zero for both keeps the surface's look.
export type PartFinish = { opacity: number; envMapIntensity: number; roughness: number };

// Share of a surface's roughness a fully reflective part loses.
const SMOOTHING = 0.85;

const unit = (value: number | undefined) => Math.min(1, Math.max(0, value ?? 0));

export function partFinish(geom: Pick<SceneGeom, "transparency" | "reflectance">): PartFinish {
  const reflectance = unit(geom.reflectance);
  return { opacity: 1 - unit(geom.transparency), envMapIntensity: reflectance, roughness: 1 - SMOOTHING * reflectance };
}
