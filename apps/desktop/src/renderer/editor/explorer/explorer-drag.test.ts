import { describe, expect, it } from "vitest";
import type { SceneObject, SceneTree } from "../../ports/scene-port.ts";
import { canDrop } from "./explorer-drag.ts";

const row = (id: string, depth: number, action = false): SceneObject => ({ id, name: id, icon: "box", depth, action });

const tree: SceneTree = {
  selected: null,
  sections: [
    { label: "World", objects: [row("ground", 0), row("sun", 0)] },
    {
      label: "Car",
      objects: [row("car", 0), row("steer", 1), row("wheel", 2), row("rear", 1), row("goal", 0), row("add", 0, true)],
    },
  ],
};

describe("canDrop", () => {
  it("nests a row under another object of its section", () => {
    expect(canDrop(tree, "rear", "Car", "steer")).toBe(true);
    expect(canDrop(tree, "goal", "Car", "wheel")).toBe(true);
  });

  it("never drops into itself, something nested in it, where it already is, or another section", () => {
    expect(canDrop(tree, "car", "Car", "car")).toBe(false);
    expect(canDrop(tree, "car", "Car", "wheel")).toBe(false);
    expect(canDrop(tree, "wheel", "Car", "steer")).toBe(false);
    expect(canDrop(tree, "goal", "World", "ground")).toBe(false);
    expect(canDrop(tree, "goal", "Car", "add")).toBe(false);
  });

  it("takes a nested row back to the top of its section, and only a nested one", () => {
    expect(canDrop(tree, "wheel", "Car", null)).toBe(true);
    expect(canDrop(tree, "goal", "Car", null)).toBe(false);
  });
});
