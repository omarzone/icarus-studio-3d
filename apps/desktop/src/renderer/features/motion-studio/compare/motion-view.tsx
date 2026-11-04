import { tokens } from "@icarus/ui-tokens";
import { useEffect, useState } from "react";
import type { MotionPlayback, Pose } from "../../../ports/motion-port.ts";
import { ClipFrame } from "../clip-frame.tsx";

type Figure = "reference" | "result";

type Props = {
  label: string;
  caption: string;
  playback?: MotionPlayback;
  // Which stick figures this view plays: the tracked reference, the physics result, or both over each other.
  figures?: readonly Figure[];
  speed?: string;
};

// The frame a clip shows at a moment, looping, at the playback speed ("0.5×", "1×").
function useClipFrame(playback: MotionPlayback | undefined, speed: string): number {
  const [frame, setFrame] = useState(0);
  const rate = Number.parseFloat(speed) || 1;
  useEffect(() => {
    const length = Math.max(playback?.reference.length ?? 0, playback?.result.length ?? 0);
    if (!playback || length < 2) {
      return;
    }
    const started = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      setFrame(Math.floor((((now - started) / 1000) * playback.fps * rate) % length));
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playback, rate]);
  return frame;
}

function Stick({ pose, color }: { pose: Pose; color: string }) {
  const [neckX, neckY] = pose.neck;
  const [hipX, hipY] = pose.hip;
  const limbs = [
    `M${neckX},${neckY} L${hipX},${hipY}`,
    ...pose.hands.map(([x, y]) => `M${neckX},${neckY} L${x},${y}`),
    ...pose.feet.map(([x, y]) => `M${hipX},${hipY} L${x},${y}`),
  ].join(" ");
  return (
    <g>
      <circle cx={pose.head[0]} cy={pose.head[1]} r={4} fill="none" stroke={color} strokeWidth={1.6} />
      <path d={limbs} stroke={color} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    </g>
  );
}

// The tracked reference over its video frames (or as a stick figure without them) and the physics result as a stick figure.
export function MotionView({ label, caption, playback, figures = [], speed = "1×" }: Props) {
  const frame = useClipFrame(playback, speed);
  const [broken, setBroken] = useState(false);
  const strip = playback?.strip ?? null;
  const index = strip ? Math.min(frame, strip.count - 1) : 0;
  const points = playback?.points[index];
  // The video only stands in for the reference alone: the physics result is not in the picture's coordinates.
  const video = strip && points && !broken && figures.includes("reference") && !figures.includes("result");
  const shown = figures.flatMap((figure) => {
    if (video && figure === "reference") {
      return [];
    }
    const poses = playback?.[figure] ?? [];
    const pose = poses[Math.min(frame, poses.length - 1)];
    return pose ? [{ figure, pose }] : [];
  });
  return (
    <div role="img" aria-label={label} className="relative min-w-0 flex-1 overflow-hidden rounded-[14px] bg-app">
      {video ? (
        <div className="absolute inset-0">
          <ClipFrame strip={strip} index={index} points={points} onError={() => setBroken(true)} />
        </div>
      ) : null}
      {shown.length > 0 ? (
        <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 60 70" preserveAspectRatio="xMidYMid meet">
          {shown.map(({ figure, pose }) => (
            <Stick
              key={figure}
              pose={pose}
              color={figure === "reference" ? tokens.viz.pose : tokens.color.fg.default}
            />
          ))}
        </svg>
      ) : null}
      {playback && figures.includes("result") && playback.result.length === 0 ? (
        <span className="absolute inset-x-0 top-1/2 text-center text-ui text-fg-tertiary">
          The physics result appears once the copy has trained
        </span>
      ) : null}
      <span className="absolute top-3 left-3 rounded-button bg-overlay px-2.5 py-1.5 text-ui">{caption}</span>
    </div>
  );
}
