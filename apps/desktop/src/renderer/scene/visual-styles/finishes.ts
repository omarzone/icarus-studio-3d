import type { SceneGeom } from "@icarus/contracts";

// What one piece of a drawn part is made of. "paint", "matte", "shade", "rubber", "shell", "joint", "concrete",
// "marking", "foliage", "wood", "stone" and "water" take the part's own color; the rest are fixed scene materials.
export type Finish =
  | "paint"
  | "matte"
  | "shade"
  | "glass"
  | "trim"
  | "chrome"
  | "metal"
  | "rubber"
  | "headlight"
  | "taillight"
  | "lamp"
  | "band"
  | "shell"
  | "joint"
  | "concrete"
  | "marking"
  | "foliage"
  | "bark"
  | "wood"
  | "stone"
  | "water"
  | "window"
  | "roof";

// A surface's own grain, or a pattern only a part's finish draws.
export type Grain = NonNullable<SceneGeom["surface"]> | "brick" | "tiles" | "road" | "fabric" | "blocks";

// Physically based settings for a Three.js standard or physical material; `color` replaces the part's color, and
// `shade` darkens it. `grain` lays a procedural texture over the color.
export type MaterialLook = {
  roughness: number;
  metalness: number;
  clearcoat?: number;
  color?: string;
  shade?: number;
  emissive?: number;
  grain?: Grain;
  // Paint on another surface: drawn just in front of it and never casting a shadow.
  decal?: boolean;
  // The color it glows in when `emissive` is set; without one it glows in its own color.
  glow?: string;
  // See-through share kept, 1 for opaque; the part's own transparency lowers it further.
  opacity?: number;
};

// Scene material constants (tokens: scene.material.*); only parts drawn with a style use them.
const GLASS = "#1d2733";
const TRIM = "#1b1d21";
const CHROME = "#d4d8de";
const METAL = "#5c626b";
const HEADLIGHT = "#fff3d6";
const TAILLIGHT = "#d6342c";
const LAMP = "#fff0c8";
const BAND = "#f2f2f2";
const BARK = "#5b4632";
const ROOF = "#4a3b36";
export const WINDOW_LIGHT = "#ffd99a";

export function finishLook(finish: Finish): MaterialLook {
  switch (finish) {
    case "paint":
      return { roughness: 0.32, metalness: 0.15, clearcoat: 0.8 };
    case "matte":
      return { roughness: 0.75, metalness: 0 };
    case "shade":
      return { roughness: 0.8, metalness: 0, shade: 0.6 };
    case "glass":
      return { roughness: 0.08, metalness: 0.3, clearcoat: 1, color: GLASS };
    case "trim":
      return { roughness: 0.55, metalness: 0.1, color: TRIM };
    case "chrome":
      return { roughness: 0.22, metalness: 1, color: CHROME };
    case "metal":
      return { roughness: 0.4, metalness: 0.8, color: METAL };
    case "rubber":
      return { roughness: 0.92, metalness: 0, grain: "rubber" };
    case "headlight":
      return { roughness: 0.2, metalness: 0, color: HEADLIGHT, emissive: 0.9 };
    case "taillight":
      return { roughness: 0.3, metalness: 0, color: TAILLIGHT, emissive: 0.6 };
    case "lamp":
      return { roughness: 0.3, metalness: 0, color: LAMP, emissive: 1.4 };
    case "band":
      return { roughness: 0.35, metalness: 0.2, color: BAND };
    // tokens: scene.material.shell, roughness 0.35, clearcoat 0.6
    case "shell":
      return { roughness: 0.35, metalness: 0, clearcoat: 0.6 };
    // tokens: scene.material.joint, metalness 0.85
    case "joint":
      return { roughness: 0.35, metalness: 0.85 };
    case "concrete":
      return { roughness: 0.9, metalness: 0, grain: "concrete" };
    case "marking":
      return { roughness: 0.7, metalness: 0, decal: true };
    case "foliage":
      return { roughness: 0.9, metalness: 0, grain: "grass" };
    case "bark":
      return { roughness: 0.95, metalness: 0, color: BARK, grain: "wood" };
    case "wood":
      return { roughness: 0.72, metalness: 0, grain: "wood" };
    case "stone":
      return { roughness: 0.95, metalness: 0, grain: "concrete" };
    case "water":
      return { roughness: 0.04, metalness: 0.1, clearcoat: 1, opacity: 0.85 };
    // Dark glass that lights up with the part's glow, as windows at night.
    case "window":
      return { roughness: 0.1, metalness: 0.4, clearcoat: 1, color: GLASS, glow: WINDOW_LIGHT };
    case "roof":
      return { roughness: 0.85, metalness: 0, color: ROOF, grain: "rubber" };
  }
}

// A plain part made of `surface`; without one, the look every scene had before surfaces were exported.
export function surfaceLook(surface: SceneGeom["surface"], ground: boolean): MaterialLook {
  const grain = ground && surface ? surface : undefined;
  switch (surface) {
    case undefined:
    case null:
      return { roughness: 0.8, metalness: 0 };
    case "asphalt":
      return { roughness: 0.92, metalness: 0, grain };
    case "concrete":
      return { roughness: 0.88, metalness: 0, grain };
    case "grass":
      return { roughness: 0.95, metalness: 0, grain };
    case "snow":
      return { roughness: 0.7, metalness: 0, grain };
    case "ice":
      return { roughness: 0.12, metalness: 0.05, clearcoat: 1, grain };
    case "rubber":
      return { roughness: 0.85, metalness: 0, grain };
    case "wood":
      return { roughness: 0.75, metalness: 0, grain };
    case "metal":
      return { roughness: 0.35, metalness: 0.85, grain };
  }
}
