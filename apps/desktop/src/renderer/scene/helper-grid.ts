import type { SceneGeom } from "@icarus/contracts";
import { isGround } from "./ground-geom.ts";

// How the editing grid is asked to show: "auto" leaves it to the world, "on" and "off" are the person's choice.
export type HelperGridMode = "auto" | "on" | "off";

// The grid is an editing aid for a world without a floor of its own; over a ground it only covers what the world
// looks like, so "auto" hides it there. Play, replays and live training never draw it.
export function helperGridShown(mode: HelperGridMode, geoms: readonly Pick<SceneGeom, "shape" | "ground">[]): boolean {
  switch (mode) {
    case "on":
      return true;
    case "off":
      return false;
    case "auto":
      return !geoms.some(isGround);
  }
}
