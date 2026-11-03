import type { SceneAnchor, SceneDescription, SceneSignals } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { copyGrid } from "./copy-grid.ts";
import {
  anchorPose,
  blinkAmount,
  displayPoint,
  easedGlow,
  eyeCenters,
  faceDepth,
  headingTurn,
  partPoint,
  plateLook,
  pupilShift,
} from "./decor-look.ts";
import { barFill, displayText, NO_VALUE } from "./display-text.ts";
import { displayValue, ownName, plateSignal } from "./scene-signals.ts";

const torso: SceneAnchor = {
  object: "torso",
  geom: "torso",
  position: [0, 0, 1],
  quaternion: [1, 0, 0, 0],
  size: [0.3, 0.4, 0.4],
};

const signals: SceneSignals = {
  plates: [
    { object: "pad", pressed: true, occupied: true, active: true, reached: true },
    { object: "next", pressed: false, occupied: false, active: false, reached: true },
  ],
  displays: [
    { object: "clock", value: 75.4 },
    { object: "distance", value: null },
  ],
};

describe("displays", () => {
  it("formats the engine's value as an integer, decimals, a clock or text, after its label", () => {
    expect(displayText({ source: "training_steps", format: "integer", label: "GEN" }, 1249.6)).toBe("GEN 1250");
    expect(displayText({ source: "goal_distance", format: "decimal", decimals: 2 }, 1.23456)).toBe("1.23");
    expect(displayText({ source: "episode_time", format: "time" }, 75.9)).toBe("01:15");
    expect(displayText({ source: "reward", format: "text" }, 2.5)).toBe("2.5");
  });

  it("shows -- while the engine reports no value, and a fixed display its own text", () => {
    expect(displayText({ source: "goal_distance", format: "decimal", label: "TO GOAL" }, null)).toBe(
      `TO GOAL ${NO_VALUE}`,
    );
    expect(displayText({ source: "fixed", format: "text", text: "LEVEL 1" }, null)).toBe("LEVEL 1");
  });

  it("fills a bar by the value's share of its full scale, empty without a value", () => {
    expect(barFill(0.25, 1)).toBe(0.25);
    expect(barFill(3, 2)).toBe(1);
    expect(barFill(-1, 2)).toBe(0);
    expect(barFill(null, 1)).toBe(0);
  });

  it("reads each display's value and each plate's state from the engine's signals", () => {
    expect(displayValue(signals, "clock")).toBe(75.4);
    expect(displayValue(signals, "distance")).toBeNull();
    expect(displayValue(null, "clock")).toBeNull();
    expect(plateSignal(signals, "pad")?.active).toBe(true);
    expect(plateSignal(signals, "missing")).toBeUndefined();
    expect(ownName("3:pad")).toBe("pad");
    expect(ownName("pad")).toBe("pad");
  });
});

describe("plates", () => {
  it("glow and sink only while the engine reports their trigger, dimmer once reached, striped as start pads", () => {
    const plate = { role: "pressure" as const, sink: 0.02 };
    expect(plateLook(plate, plateSignal(signals, "pad"))).toEqual({ glow: 1, sink: 0.02, stripes: false });
    expect(plateLook(plate, plateSignal(signals, "next"))).toEqual({ glow: 0.3, sink: 0, stripes: false });
    expect(plateLook({ role: "start", sink: 0.01 }, undefined)).toEqual({ glow: 0, sink: 0, stripes: true });
  });

  it("are laid out per copy with their names prefixed like the copies' geoms", () => {
    const scene: SceneDescription = {
      revision: 1,
      bodies: [],
      lights: [],
      geoms: [],
      plates: [
        {
          name: "pad:plate",
          object: "pad",
          role: "target",
          shape: "box",
          size: [1, 1, 0.02],
          position: [2, 0, 0.01],
          quaternion: [1, 0, 0, 0],
          color: "#34c759",
        },
      ],
      eyes: [{ anchor: torso, size: 0.1, spacing: 0.1 }],
    };
    const grid = copyGrid(scene, 2).description;
    expect(grid.plates?.map((plate) => [plate.name, plate.object])).toEqual([
      ["0:pad:plate", "0:pad"],
      ["1:pad:plate", "1:pad"],
    ]);
    expect(grid.eyes?.map((eyes) => eyes.anchor.geom)).toEqual(["0:torso", "1:torso"]);
    expect(grid.plates?.[0]?.position[0]).not.toBe(grid.plates?.[1]?.position[0]);
  });
});

describe("anchors and eyes", () => {
  it("ride the part's engine pose when it has one and its scene pose otherwise", () => {
    const live = { position: [5, 0, 1] as const, quaternion: headingTurn(90) };
    expect(anchorPose(torso, null).position).toEqual([0, 0, 1]);
    expect(anchorPose(torso, live)).toBe(live);
    const ahead = partPoint(live, [1, 0, 0]);
    expect(ahead[0]).toBeCloseTo(5);
    expect(ahead[1]).toBeCloseTo(1);
  });

  it("keep a camera-facing display above its part in world axes while a fixed one turns with the part", () => {
    const tumbled = { position: [0, 0, 1] as const, quaternion: [Math.SQRT1_2, Math.SQRT1_2, 0, 0] as const };
    expect(displayPoint(tumbled, [0, 0, 0.5], true)).toEqual([0, 0, 1.5]);
    const turned = displayPoint(tumbled, [0, 0, 0.5], false);
    expect(turned[1]).toBeCloseTo(-0.5);
    expect(turned[2]).toBeCloseTo(1);
  });

  it("light a plate at once and let its glow fade instead of flickering", () => {
    expect(easedGlow(0, 1, 0.016)).toBe(1);
    expect(easedGlow(1, 0, 0.05)).toBeCloseTo(0.7);
    expect(easedGlow(0.1, 0, 1)).toBe(0);
  });

  it("sit on the face of the part they look out of, spaced to either side", () => {
    expect(faceDepth([0.3, 0.4, 0.4], 0)).toBeCloseTo(0.15);
    expect(faceDepth([0.3, 0.4, 0.4], 90)).toBeCloseTo(0.2);
    expect(eyeCenters({ anchor: torso, spacing: 0.12, height: 0.05, facing: 0 })).toEqual([
      [0.15, -0.06, 0.05],
      [0.15, 0.06, 0.05],
    ]);
  });

  it("blink briefly once in each interval, the same way every time for the same eyes", () => {
    const samples = Array.from({ length: 600 }, (_, index) => blinkAmount(index / 100, 3, 0.5, 7));
    const shut = samples.filter((amount) => amount > 0.5).length;
    expect(shut).toBeGreaterThan(0);
    expect(shut).toBeLessThan(samples.length * 0.1);
    expect(Array.from({ length: 600 }, (_, index) => blinkAmount(index / 100, 3, 0.5, 7))).toEqual(samples);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
  });

  it("move the pupils toward where the part goes, centered when it goes nowhere", () => {
    expect(pupilShift([0, 0, 0])).toEqual([0, 0]);
    expect(pupilShift([1, 0, 0])).toEqual([0, 0]);
    const [left, up] = pupilShift([1, 1, 0]);
    expect(left).toBeCloseTo(Math.SQRT1_2);
    expect(up).toBe(0);
  });
});
