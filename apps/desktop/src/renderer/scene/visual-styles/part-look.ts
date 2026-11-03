import type { SceneGeom } from "@icarus/contracts";
import { isGround } from "../ground-geom.ts";
import { type Finish, finishLook, type MaterialLook, surfaceLook } from "./finishes.ts";
import { paletteLook } from "./palette-look.ts";

type Pattern = NonNullable<SceneGeom["finish"]>;
type PartLook = Pick<
  SceneGeom,
  "finish" | "roughness" | "metalness" | "emissive" | "surface" | "shape" | "ground" | "material"
>;

// A palette material draws its own pattern; without one the part's finish does.
const facePattern = (geom: PartLook): MaterialLook | null =>
  geom.material ? paletteLook(geom.material) : patternLook(geom.finish);

// Fixed tones of the asphalt finish, whose lane lines need their own white (tokens: scene.material.style).
const ROAD = "#ffffff";

// The look a part's finish gives its faces; drawing only, the surface still sets friction. Null for plain.
export function patternLook(finish: Pattern | null | undefined): MaterialLook | null {
  switch (finish) {
    case undefined:
    case null:
    case "plain":
      return null;
    case "brick":
      return { roughness: 0.9, metalness: 0, grain: "brick" };
    case "concrete":
      return { roughness: 0.88, metalness: 0, grain: "concrete" };
    case "asphalt":
      return { roughness: 0.9, metalness: 0, grain: "road", color: ROAD };
    case "wood":
      return { roughness: 0.72, metalness: 0, grain: "wood" };
    case "tiles":
      return { roughness: 0.45, metalness: 0, grain: "tiles" };
    case "painted_metal":
      return { roughness: 0.35, metalness: 0.6, clearcoat: 0.5 };
    case "glass":
      return { roughness: 0.05, metalness: 0.2, clearcoat: 1, opacity: 0.45 };
    case "grass":
      return { roughness: 0.95, metalness: 0, grain: "grass" };
    case "fabric":
      return { roughness: 0.97, metalness: 0, grain: "fabric" };
    case "rubber":
      return { roughness: 0.92, metalness: 0, grain: "rubber" };
    case "blocks":
      return { roughness: 0.7, metalness: 0, grain: "blocks" };
  }
}

// Pieces drawn in the part's own color take its finish; glass, lights and trim keep theirs.
const PATTERNED: ReadonlySet<Finish> = new Set(["paint", "matte", "concrete", "wood", "stone", "shell"]);
// Pieces that light up with the part's glow: windows and lamps.
const LIT: ReadonlySet<Finish> = new Set(["window", "lamp", "headlight", "taillight"]);

// 0.5 keeps `base`; lower moves it toward 0 and higher toward 1.
export function adjusted(base: number, setting: number | undefined): number {
  const value = Math.min(1, Math.max(0, setting ?? 0.5));
  return value < 0.5 ? base * (value / 0.5) : base + (1 - base) * ((value - 0.5) / 0.5);
}

function tuned(look: MaterialLook, geom: PartLook): MaterialLook {
  return {
    ...look,
    roughness: adjusted(look.roughness, geom.roughness),
    metalness: adjusted(look.metalness, geom.metalness),
  };
}

// One drawn piece of a styled part: its finish, the part's pattern when the piece is drawn in the part's color, and
// the part's glow on its windows and lamps.
export function styledLook(finish: Finish, geom: PartLook): MaterialLook {
  const base = finishLook(finish);
  const pattern = PATTERNED.has(finish) ? facePattern(geom) : null;
  const look = pattern ? { ...base, ...pattern } : base;
  const glow = geom.emissive ?? 0;
  return tuned(LIT.has(finish) && glow > 0 ? { ...look, emissive: (look.emissive ?? 0) + glow } : look, geom);
}

// A part drawn as its plain primitive: its finish, else its surface, glowing as a whole when it has a glow.
export function plainLook(geom: PartLook): MaterialLook {
  const look = facePattern(geom) ?? surfaceLook(geom.surface, isGround(geom));
  const glow = geom.emissive ?? 0;
  return tuned(glow > 0 ? { ...look, emissive: (look.emissive ?? 0) + glow } : look, geom);
}
