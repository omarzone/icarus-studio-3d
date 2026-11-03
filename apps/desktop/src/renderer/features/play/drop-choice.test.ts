import { describe, expect, it } from "vitest";
import type { PlayPiece } from "../../ports/play-port.ts";
import { choosePiece, freshDrop, placingHint, ratioOf, typedWeight, valueAt } from "./drop-choice.ts";

const ball: PlayPiece = {
  id: "ball",
  label: "Ball",
  category: "basics",
  mass: 0.5,
  friction: 0.8,
  bounciness: 0,
  color: "#d9534f",
};
const wall: PlayPiece = {
  id: "wall",
  label: "Wall",
  category: "basics",
  mass: null,
  friction: 0.8,
  bounciness: 0,
  color: "#9ca3af",
};

describe("add object choices", () => {
  it("starts another piece from its own values, keeping how and how many, and only places a fixed one", () => {
    const tuned = { ...freshDrop("box"), placement: "throw" as const, count: 4, color: "#000000", friction: 0.1 };
    expect(choosePiece(tuned, ball)).toMatchObject({
      piece: "ball",
      placement: "throw",
      count: 4,
      color: null,
      friction: null,
    });
    expect(choosePiece(tuned, wall).placement).toBe("place");
  });

  it("keeps a typed weight only when it is a number in range", () => {
    expect(typedWeight("mass", "12.5")).toEqual({ kind: "mass", value: 12.5 });
    expect(typedWeight("density", "800")).toEqual({ kind: "density", value: 800 });
    expect(typedWeight("mass", "")).toBeNull();
    expect(typedWeight("mass", "heavy")).toBeNull();
    expect(typedWeight("mass", "20000")).toBeNull();
    expect(typedWeight("density", "5")).toBeNull();
  });

  it("maps slider positions to values within the engine's bounds", () => {
    expect(valueAt("speed", 0)).toBe(1);
    expect(valueAt("speed", 1)).toBe(30);
    expect(valueAt("count", 0.5, 0)).toBe(16);
    expect(ratioOf("bounciness", 0.25)).toBeCloseTo(0.25);
    expect(ratioOf("scale", 99)).toBe(1);
  });

  it("says where to click for each way of adding", () => {
    expect(placingHint({ ...freshDrop("ball"), placement: "place" }, "Ball")).toBe("Click to place: Ball");
    expect(placingHint(freshDrop("ball"), "Ball")).toBe("Click where to drop: Ball");
    expect(placingHint({ ...freshDrop("ball"), placement: "throw", count: 5 }, "Ball")).toBe(
      "Click where to throw from: 5 × Ball",
    );
  });
});
