import { describe, expect, it } from "vitest";
import { MOTION_FPS, MOTION_SECONDS, motionFrameTimes, videoProblem } from "./motion-frames.ts";

describe("sampling a reference video", () => {
  it("takes an even rate over the first seconds", () => {
    const times = motionFrameTimes(3);
    expect(times).toHaveLength(3 * MOTION_FPS);
    expect(times[0]).toBeCloseTo(0.5 / MOTION_FPS);
    expect(motionFrameTimes(60)).toHaveLength(MOTION_SECONDS * MOTION_FPS);
    expect(motionFrameTimes(Number.NaN)).toEqual([]);
  });

  it("accepts common videos and says why anything else cannot be copied", () => {
    expect(videoProblem({ name: "salsa.mp4", type: "video/mp4", size: 1000 })).toBeNull();
    expect(videoProblem({ name: "notes.txt", type: "text/plain", size: 10 })).toContain("not an .mp4");
  });
});
