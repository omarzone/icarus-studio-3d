import { tokens } from "@icarus/ui-tokens";
import { useEffect, useState } from "react";
import type { FramePoint, FrameStrip } from "../../ports/motion-port.ts";

const BONES: readonly (readonly [string, string])[] = [
  ["head", "neck"],
  ["neck", "left_shoulder"],
  ["neck", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
];

// Steps through the clip's frames at its own rate while `playing`, so the pictures move like the video.
export function useFrameCycle(count: number, fps: number, playing: boolean): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!playing || count < 2) {
      return;
    }
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), 1000 / Math.max(1, fps));
    return () => clearInterval(timer);
  }, [count, fps, playing]);
  return Math.min(index, Math.max(0, count - 1));
}

type Props = { strip: FrameStrip; index: number; points?: readonly FramePoint[] };

// One sampled frame as the engine keeps it, with the tracked person drawn over it when there is one.
export function ClipFrame({ strip, index, points }: Props) {
  const at = new Map((points ?? []).map((point) => [point.name, point]));
  return (
    <div className="flex size-full items-center justify-center overflow-hidden">
      <div className="relative h-full">
        <img
          src={strip.url(index)}
          alt={`Frame ${index + 1} of ${strip.count}`}
          draggable={false}
          className="block h-full w-auto"
        />
        {points && points.length > 0 ? (
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
          >
            {BONES.map(([from, to]) => {
              const a = at.get(from);
              const b = at.get(to);
              return a && b ? (
                <line
                  key={`${from}-${to}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={tokens.viz.pose}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null;
            })}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
