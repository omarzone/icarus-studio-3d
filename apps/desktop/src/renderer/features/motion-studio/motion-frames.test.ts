import { describe, expect, it } from "vitest";
import { MOTION_FPS, MOTION_SECONDS, motionFrameTimes, partStart, videoProblem } from "./motion-frames.ts";

describe("sampling a reference video", () => {
  it("takes an even rate over the first seconds", () => {
    const times = motionFrameTimes(3);
    expect(times).toHaveLength(3 * MOTION_FPS);
    expect(times[0]).toBeCloseTo(0.5 / MOTION_FPS);
    expect(motionFrameTimes(60)).toHaveLength(MOTION_SECONDS * MOTION_FPS);
    expect(motionFrameTimes(Number.NaN)).toEqual([]);
  });

  it("samples the chosen part, and never a part that would run past the end", () => {
    const times = motionFrameTimes(200, 14);
    expect(times).toHaveLength(MOTION_SECONDS * MOTION_FPS);
    expect(times[0]).toBeCloseTo(14 + 0.5 / MOTION_FPS);
    expect(times.at(-1)).toBeLessThan(26);
    expect(partStart(200, 195)).toBe(188);
    expect(partStart(8, 3)).toBe(0);
    expect(motionFrameTimes(200, 195)[0]).toBeCloseTo(188 + 0.5 / MOTION_FPS);
  });

  it("accepts common videos and says why anything else cannot be copied", () => {
    expect(videoProblem({ name: "salsa.mp4", type: "video/mp4", size: 1000 })).toBeNull();
    expect(videoProblem({ name: "notes.txt", type: "text/plain", size: 10 })).toContain("not an .mp4");
  });
});
