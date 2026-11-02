import { describe, expect, it } from "vitest";
import { createMotionPlayer, type RecordedFrame } from "./motion-player.ts";

const frame = (episode: number, time: number, x: number): RecordedFrame => ({
  episode,
  time,
  poses: new Map([["torso", { position: [x, 0, 1], quaternion: [1, 0, 0, 0] }]]),
  rays: [],
});

const xAt = (player: ReturnType<typeof createMotionPlayer>, now: number) =>
  player.sample(now).copies[0]?.get("torso")?.position[0];

describe("motion player", () => {
  it("plays recorded frames at 1x sim speed, moving between two real frames", () => {
    const player = createMotionPlayer("realtime");
    player.push([[frame(1, 0, 0), frame(1, 0.1, 1), frame(1, 0.2, 2)]], 1000);

    expect(xAt(player, 1000)).toBe(0);
    expect(xAt(player, 1050)).toBeCloseTo(0.5, 6);
    expect(xAt(player, 1150)).toBeCloseTo(1.5, 6);
  });

  it("holds the newest frame when nothing more arrives, never moving past it", () => {
    const player = createMotionPlayer("realtime");
    player.push([[frame(1, 0, 0), frame(1, 0.1, 1)]], 0);

    expect(xAt(player, 5000)).toBe(1);
    // Frames that arrive later play on from the held pose, not from where a clock would have been.
    player.push([[frame(1, 0.2, 2)]], 5000);
    expect(xAt(player, 5050)).toBeCloseTo(1.5, 6);
  });

  it("cuts to a new episode instead of blending the end of one into the start of the next", () => {
    const player = createMotionPlayer("realtime");
    player.push([[frame(1, 29.9, 5), frame(1, 30, 6), frame(2, 4, -3), frame(2, 4.1, -2)]], 0);

    // 0.1 s plays to the episode's last frame, then the 0.05 s cut holds it.
    expect(xAt(player, 120)).toBe(6);
    expect(xAt(player, 160)).toBeCloseTo(-2.9, 6);
    expect(xAt(player, 200)).toBeCloseTo(-2.5, 6);
  });

  it("skips frames it already holds, so a snapshot read twice never rewinds the view", () => {
    const player = createMotionPlayer("realtime");
    player.push([[frame(1, 0, 0), frame(1, 0.1, 1)]], 0);
    player.push([[frame(1, 0, 0), frame(1, 0.1, 1), frame(1, 0.2, 2)]], 100);

    expect(xAt(player, 100)).toBe(1);
    expect(xAt(player, 150)).toBeCloseTo(1.5, 6);
  });

  it("plays faster than real time in fast mode to keep pace with frames arriving faster", () => {
    const player = createMotionPlayer("fast");
    // Each push brings 2 s of sim time every 0.2 s: ten times real time.
    for (let push = 0; push < 20; push += 1) {
      const start = push * 2;
      player.push(
        [[frame(1, start, start), frame(1, start + 1, start + 1), frame(1, start + 2, start + 2)]],
        push * 200,
      );
    }
    const shown = xAt(player, 19 * 200) ?? 0;
    // The newest frame is at 40 s; realtime playback would be at 3.8 s.
    expect(shown).toBeGreaterThan(30);
    expect(shown).toBeLessThanOrEqual(40);
  });
});
