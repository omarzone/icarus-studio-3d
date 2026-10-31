// TAB-CLIP
import { tokens } from "@icarus/ui-tokens";
import { Act } from "../../../app/navigation/go-to.tsx";
import type { ClipTimeline, Pose } from "../../../ports/motion-port.ts";

type Props = { timeline: ClipTimeline; onFrame: (index: number) => void };

const CURVE_WIDTH = 600;
const CURVE_HEIGHT = 42;

// Pose frames along the clip with the current one highlighted, then the match curve with its playhead.
export function ClipTab({ timeline, onFrame }: Props) {
  return (
    <div className="flex h-full flex-col gap-2 px-3 pt-2.5 pb-3">
      <div className="flex gap-1.5">
        {timeline.frames.map((pose, index) => {
          const current = index === timeline.current;
          return (
            <Act
              // biome-ignore lint/suspicious/noArrayIndexKey: frames are in clip order.
              key={index}
              cta={`Frame ${index + 1}`}
              aria-label={`Frame ${index + 1} of ${timeline.frames.length}`}
              aria-current={current ? "true" : undefined}
              onClick={() => onFrame(index)}
              className={`grid flex-1 place-items-center rounded-[10px] py-1 active:opacity-80 ${
                current ? "bg-control-raised" : "bg-control hover:bg-control-raised"
              }`}
            >
              <PoseFigure pose={pose} color={current ? tokens.viz.pose : tokens.color.fg.default} />
            </Act>
          );
        })}
      </div>
      <MatchCurve match={timeline.match} playhead={timeline.playhead} />
    </div>
  );
}

// A tracked pose as a stick figure: head, spine, arms to the hands and legs to the feet.
function PoseFigure({ pose, color }: { pose: Pose; color: string }) {
  const [neckX, neckY] = pose.neck;
  const [hipX, hipY] = pose.hip;
  const limbs = [
    `M${neckX},${neckY} L${hipX},${hipY}`,
    ...pose.hands.map(([x, y]) => `M${neckX},${neckY} L${x},${y}`),
    ...pose.feet.map(([x, y]) => `M${hipX},${hipY} L${x},${y}`),
  ].join(" ");
  return (
    <svg aria-hidden width="40" height="48" viewBox="0 0 60 70">
      <circle cx={pose.head[0]} cy={pose.head[1]} r={5} fill="none" stroke={color} strokeWidth={2} />
      <path d={limbs} stroke={color} strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </svg>
  );
}

function curvePath(match: readonly number[]): string {
  const points = match.map((value, index): [number, number] => [
    (index / Math.max(1, match.length - 1)) * CURVE_WIDTH,
    CURVE_HEIGHT - 4 - value * (CURVE_HEIGHT - 10),
  ]);
  return points
    .map(([x, y], index) => {
      if (index === 0) {
        return `M${x},${y}`;
      }
      const [px, py] = points[index - 1] ?? [x, y];
      const mid = (px + x) / 2;
      return `C${mid},${py} ${mid},${y} ${x},${y}`;
    })
    .join(" ");
}

// How closely the copy matches the video along the clip, with the playhead.
function MatchCurve({ match, playhead }: { match: readonly number[]; playhead: number }) {
  const x = playhead * CURVE_WIDTH;
  return (
    <svg
      role="img"
      aria-label="How closely the character matches the video over the clip"
      width="100%"
      height={CURVE_HEIGHT}
      viewBox={`0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}`}
      preserveAspectRatio="none"
    >
      <path
        d={curvePath(match)}
        fill="none"
        stroke={tokens.viz.pose}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={x}
        y1={0}
        x2={x}
        y2={CURVE_HEIGHT}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className="stroke-fg"
      />
    </svg>
  );
}
