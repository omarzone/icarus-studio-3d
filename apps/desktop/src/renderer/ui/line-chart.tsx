import { tokens } from "@icarus/ui-tokens";

type Props = {
  label: string;
  samples: readonly number[];
  min: number;
  max: number;
  // "primary" for the main series, "danger" for failure-type series.
  meaning: "primary" | "danger";
  className?: string;
};

const WIDTH = 300;
const HEIGHT = 96;

// Smooth curve through the points (Catmull-Rom as cubic Béziers).
function curve(points: readonly (readonly [number, number])[]): string {
  const first = points[0];
  if (!first) {
    return "";
  }
  let path = `M${first[0]},${first[1]}`;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) {
      continue;
    }
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return path;
}

// Line chart from the style guide: 2 px line, 8% area, horizontal grid only, exact values on hover.
export function LineChart({ label, samples, min, max, meaning, className = "h-24 w-full" }: Props) {
  const color = meaning === "primary" ? "var(--ic-fg)" : "var(--ic-danger-graphic)";
  const span = max - min || 1;
  const step = samples.length > 1 ? WIDTH / (samples.length - 1) : 0;
  const points = samples.map(
    (value, index) => [index * step, HEIGHT - 4 - ((value - min) / span) * (HEIGHT - 8)] as const,
  );
  const line = curve(points);
  const last = points.at(-1);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={className}
    >
      <line x1="0" y1="24" x2={WIDTH} y2="24" stroke={tokens.viz.grid} />
      <line x1="0" y1="56" x2={WIDTH} y2="56" stroke={tokens.viz.grid} />
      {last ? (
        <path
          d={`${line} L${last[0]},${HEIGHT} L0,${HEIGHT} Z`}
          fill={color}
          fillOpacity={tokens.viz.lineOpacityArea}
        />
      ) : null}
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {points.map(([x], index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: samples are ordered in time and never reorder.
        <rect key={index} x={x - step / 2} y="0" width={step || WIDTH} height={HEIGHT} fill="transparent">
          <title>{`${label}: ${samples[index]}`}</title>
        </rect>
      ))}
    </svg>
  );
}
