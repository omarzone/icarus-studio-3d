import { describe, expect, it } from "vitest";
import { advance, frameAt, nextSpeed, playerAt, scrub, startPlayer, togglePlaying } from "./rollout-player.ts";

const times = [0, 0.05, 0.1, 0.15, 0.2];

describe("RolloutPlayer", () => {
  it("finds the frame recorded at or just before a time", () => {
    expect(frameAt(times, 0)).toBe(0);
    expect(frameAt(times, 0.07)).toBe(1);
    expect(frameAt(times, 0.1)).toBe(2);
    expect(frameAt(times, 9)).toBe(4);
    expect(frameAt(times, -1)).toBe(0);
    expect(frameAt([], 1)).toBe(0);
  });

  it("starts paused at the beginning at normal speed", () => {
    expect(startPlayer(0.2)).toEqual({ time: 0, duration: 0.2, playing: false, speed: 1 });
  });

  it("moves time by the elapsed seconds times the speed while playing", () => {
    const playing = togglePlaying(startPlayer(10));
    expect(advance(playing, 2).time).toBe(2);
    expect(advance({ ...playing, speed: 0.5 }, 2).time).toBe(1);
    expect(advance(startPlayer(10), 2).time).toBe(0);
  });

  it("stops at the end, and playing again starts over", () => {
    const ended = advance(togglePlaying(startPlayer(10)), 30);
    expect(ended).toMatchObject({ time: 10, playing: false });
    expect(togglePlaying(ended)).toMatchObject({ time: 0, playing: true });
  });

  it("scrubs to a share of the episode, within it", () => {
    expect(scrub(startPlayer(10), 0.25).time).toBe(2.5);
    expect(scrub(startPlayer(10), 2).time).toBe(10);
    expect(scrub(startPlayer(10), -1).time).toBe(0);
  });

  it("cycles the speed through quarter, half, normal and double", () => {
    const speeds = [startPlayer(1)];
    for (let index = 0; index < 4; index++) {
      const last = speeds.at(-1);
      if (last) {
        speeds.push(nextSpeed(last));
      }
    }
    expect(speeds.map((state) => state.speed)).toEqual([1, 2, 0.25, 0.5, 1]);
  });

  it("reads the share played and the clock of the current time", () => {
    expect(playerAt({ time: 2.5, duration: 10, playing: true, speed: 1 })).toEqual({
      played: 0.25,
      at: "0:02.5",
      length: "0:10.0",
      speed: "1×",
    });
    expect(playerAt({ time: 0, duration: 0, playing: false, speed: 0.25 })).toMatchObject({
      played: 0,
      speed: "0.25×",
    });
  });
});
