import { describe, expect, it } from "vitest";
import { fitWithin, formatDuration, frameTimes } from "./video-frames.ts";

describe("frames taken from a video", () => {
  it("are evenly spaced, each in the middle of its stretch of the video", () => {
    expect(frameTimes(8)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
    expect(frameTimes(40, 4)).toEqual([5, 15, 25, 35]);
  });

  it("are fewer for very short clips and one at the start when the length is unknown", () => {
    expect(frameTimes(0.5)).toEqual([0.125, 0.375]);
    expect(frameTimes(Number.NaN)).toEqual([0]);
    expect(frameTimes(Number.POSITIVE_INFINITY)).toEqual([0]);
    expect(frameTimes(0)).toEqual([0]);
  });

  it("shrink to fit the longest side, never grow", () => {
    expect(fitWithin(1920, 1080, 768)).toEqual({ width: 768, height: 432 });
    expect(fitWithin(1080, 1920, 768)).toEqual({ width: 432, height: 768 });
    expect(fitWithin(320, 240, 768)).toEqual({ width: 320, height: 240 });
  });

  it("show durations as minutes and seconds", () => {
    expect(formatDuration(7.4)).toBe("0:07");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3_725)).toBe("1:02:05");
    expect(formatDuration(Number.NaN)).toBe("");
  });
});
