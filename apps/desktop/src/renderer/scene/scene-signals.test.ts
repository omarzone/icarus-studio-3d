import type { SceneSignals } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { createMotionPlayer, type RecordedFrame } from "./motion-player.ts";
import { copyOf, goalMet, lampOn, signalFeed } from "./scene-signals.ts";

const braking: SceneSignals = {
  goal: { inside: true, aligned: false, stopped: true, met: false },
  lights: { brake: true, reverse: false, head: true },
};
const parked: SceneSignals = {
  goal: { inside: true, aligned: true, stopped: true, met: true },
  lights: { brake: false, reverse: false, head: false },
};

describe("scene signals", () => {
  it("lights a lamp only when the engine reports its light on", () => {
    expect(lampOn("brake", braking)).toBe(true);
    expect(lampOn("reverse", braking)).toBe(false);
    expect(lampOn("head", parked)).toBe(false);
    expect(lampOn("brake", null)).toBe(false);
  });

  it("calls a goal met only when every rule held", () => {
    expect(goalMet(braking)).toBe(false);
    expect(goalMet(parked)).toBe(true);
    expect(goalMet(undefined)).toBe(false);
  });

  it("finds the copy of a geom or zone laid side by side, and copy 0 for a single world", () => {
    expect(copyOf("3:car", 8)).toBe(3);
    expect(copyOf("2:goal:goal_zone", 8)).toBe(2);
    expect(copyOf("goal:goal_zone", 1)).toBe(0);
    expect(copyOf("12:car", 1)).toBe(0);
  });

  it("takes the signals of the recorded frame being played, switching with frames instead of blending", () => {
    const frame = (time: number, signals: SceneSignals): RecordedFrame => ({
      episode: 1,
      time,
      poses: new Map(),
      rays: [],
      signals,
    });
    const player = createMotionPlayer("realtime");
    player.push([[frame(0, braking), frame(0.1, parked)]], 1000);
    const feed = signalFeed(undefined, { at: (now) => ({ signals: player.sample(now).signals }) });
    expect(feed(1050)[0]).toEqual(braking);
    expect(feed(1100)[0]).toEqual(parked);
    expect(signalFeed([parked])(0)).toEqual([parked]);
  });
});
