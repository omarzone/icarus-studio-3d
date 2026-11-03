import type { SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { helperGridShown } from "./helper-grid.ts";

const slab: Pick<SceneGeom, "shape" | "ground"> = { shape: "box", ground: true };
const crate: Pick<SceneGeom, "shape" | "ground"> = { shape: "box" };

describe("helper grid", () => {
  it("hides itself over a world with its own ground unless asked, and shows over an empty one", () => {
    expect(helperGridShown("auto", [slab, crate])).toBe(false);
    expect(helperGridShown("auto", [{ shape: "plane" }])).toBe(false);
    expect(helperGridShown("auto", [crate])).toBe(true);
    expect(helperGridShown("on", [slab])).toBe(true);
    expect(helperGridShown("off", [crate])).toBe(false);
  });
});
