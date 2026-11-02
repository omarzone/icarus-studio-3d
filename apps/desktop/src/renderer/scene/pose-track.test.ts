import { describe, expect, it } from "vitest";
import { lerpPosition, nextTrack, type Pose, trackProgress } from "./pose-track.ts";

const at = (x: number): ReadonlyMap<string, Pose> =>
  new Map([["car", { position: [x, 0, 0], quaternion: [1, 0, 0, 0] }]]);

describe("pose track", () => {
  it("moves from the previous frame to the newest over the time between them", () => {
    const first = nextTrack(null, at(0), 1000);
    const second = nextTrack(first, at(1), 1040);
    const halfway = trackProgress(second, 1060);
    expect(halfway).toBe(0.5);
    const from = second.from.get("car")?.position ?? [0, 0, 0];
    const to = second.to.get("car")?.position ?? [0, 0, 0];
    expect(lerpPosition(from, to, halfway)).toEqual([0.5, 0, 0]);
  });

  it("stops at the newest frame instead of guessing beyond it", () => {
    const track = nextTrack(nextTrack(null, at(0), 0), at(1), 30);
    expect(trackProgress(track, 500)).toBe(1);
  });
});
