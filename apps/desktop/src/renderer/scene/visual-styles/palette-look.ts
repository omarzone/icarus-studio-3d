import type { SceneGeom } from "@icarus/contracts";
import type { MaterialLook } from "./finishes.ts";

export type MaterialPreset = NonNullable<SceneGeom["material"]>;

// How each palette material is drawn in the part's color: its pattern, how rough, metallic and glossy it is, Glass
// see-through and Neon glowing. Drawing only; the engine sets the material's grip from the same choice.
export function paletteLook(preset: MaterialPreset): MaterialLook {
  switch (preset) {
    case "plastic":
      return { roughness: 0.55, metalness: 0, grain: "plastic" };
    case "smooth_plastic":
      return { roughness: 0.22, metalness: 0, clearcoat: 0.4 };
    case "wood":
      return { roughness: 0.7, metalness: 0, grain: "wood_grain" };
    case "wood_planks":
      return { roughness: 0.72, metalness: 0, grain: "wood" };
    case "brick":
      return { roughness: 0.9, metalness: 0, grain: "brick" };
    case "cobblestone":
      return { roughness: 0.92, metalness: 0, grain: "cobblestone" };
    case "concrete":
      return { roughness: 0.88, metalness: 0, grain: "concrete" };
    case "metal":
      return { roughness: 0.38, metalness: 0.7, grain: "metal" };
    case "diamond_plate":
      return { roughness: 0.4, metalness: 0.6, grain: "diamond_plate" };
    case "corroded_metal":
      return { roughness: 0.82, metalness: 0.45, grain: "corroded" };
    case "grass":
      return { roughness: 0.95, metalness: 0, grain: "grass" };
    case "sand":
      return { roughness: 0.96, metalness: 0, grain: "sand" };
    case "ground":
      return { roughness: 0.95, metalness: 0, grain: "dirt" };
    case "ice":
      return { roughness: 0.1, metalness: 0.05, clearcoat: 1, grain: "ice", opacity: 0.85 };
    case "glass":
      return { roughness: 0.04, metalness: 0.2, clearcoat: 1, opacity: 0.35 };
    case "neon":
      return { roughness: 0.4, metalness: 0, emissive: 1.6 };
    case "marble":
      return { roughness: 0.22, metalness: 0, clearcoat: 0.5, grain: "marble" };
    case "granite":
      return { roughness: 0.6, metalness: 0, grain: "granite" };
    case "fabric":
      return { roughness: 0.97, metalness: 0, grain: "fabric" };
    case "foil":
      return { roughness: 0.22, metalness: 1, grain: "foil" };
  }
}
