// TAB-VISION
import type { CompoundEye } from "../../../ports/play-port.ts";

const RADIUS = 5;
const DX = RADIUS * Math.sqrt(3);
const DY = RADIUS * 1.5;

function hexagon(cx: number, cy: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index + Math.PI / 6;
    return `${cx + RADIUS * 0.92 * Math.cos(angle)},${cy + RADIUS * 0.92 * Math.sin(angle)}`;
  }).join(" ");
}

// What each compound eye sees, one hexagon per facet, brighter where more light reaches it.
export function VisionTab({ eyes }: { eyes: readonly CompoundEye[] }) {
  return (
    <div className="grid h-full grid-cols-2 gap-1.5 p-2">
      {eyes.map((eye) => (
        <div key={eye.label} className="relative grid place-items-center rounded-button bg-app p-1">
          <svg
            role="img"
            aria-label={`${eye.label}: what it sees`}
            viewBox={`0 0 ${eye.columns * DX + DX / 2} ${eye.rows * DY + RADIUS / 2}`}
            className="h-24 w-full"
          >
            {eye.cells.map((brightness, index) => {
              const row = Math.floor(index / eye.columns);
              const column = index % eye.columns;
              const cx = column * DX + DX / 2 + (row % 2) * (DX / 2);
              const cy = row * DY + RADIUS;
              return (
                <polygon
                  // biome-ignore lint/suspicious/noArrayIndexKey: facets keep their position in the eye.
                  key={index}
                  points={hexagon(cx, cy)}
                  fill="var(--ic-fg)"
                  fillOpacity={brightness}
                />
              );
            })}
          </svg>
          <span className="absolute bottom-1 left-1.5 text-micro text-fg-tertiary">{eye.label}</span>
        </div>
      ))}
    </div>
  );
}
