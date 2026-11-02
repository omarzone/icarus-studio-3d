import { describe, expect, it } from "vitest";
import { lerpPosition, nextTrack, type Pose, poseAt, trackProgress } from "./pose-track.ts";

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

  it("keeps moving through the whole gap of a slow stream, such as training snapshots a few times a second", () => {
    let track = nextTrack(null, at(0), 0);
    track = nextTrack(track, at(1), 400);
    track = nextTrack(track, at(2), 800);
    expect(trackProgress(track, 1100)).toBeCloseTo(0.75, 6);
  });

  it("stops at the newest frame instead of guessing beyond it", () => {
    const track = nextTrack(nextTrack(null, at(0), 0), at(1), 30);
    expect(trackProgress(track, 500)).toBe(1);
  });
});

describe("pose at a moment", () => {
  const turning = (x: number, angle: number): ReadonlyMap<string, Pose> =>
    new Map([["car", { position: [x, 0, 0], quaternion: [Math.cos(angle / 2), 0, 0, Math.sin(angle / 2)] }]]);

  it("is halfway in place and in rotation halfway between frames", () => {
    const track = nextTrack(nextTrack(null, turning(0, 0), 0), turning(2, Math.PI / 2), 100);
    const pose = poseAt(track, "car", 150);
    expect(pose?.position).toEqual([1, 0, 0]);
    const [w = 0, , , z = 0] = pose?.quaternion ?? [];
    expect(2 * Math.atan2(z, w)).toBeCloseTo(Math.PI / 4, 6);
  });

  it("knows nothing about a geom the engine never sent", () => {
    const track = nextTrack(null, turning(0, 0), 0);
    expect(poseAt(track, "boat", 0)).toBeNull();
  });
});
