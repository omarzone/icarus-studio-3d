// TAB-BRAIN-ACTIVITY
import { tokens } from "@icarus/ui-tokens";
import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { BrainRegion } from "../../ports/brain-port.ts";

const WIDTH = 200;
const CENTER_Y = 18;

// Deterministic scatter so a region keeps its shape between renders; positions are layout, the counts are data.
function scatter(seed: number, count: number): [number, number][] {
  let state = seed * 2654435761;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const angle = next() * Math.PI * 2;
    const radius = Math.sqrt(next());
    return [Math.cos(angle) * radius * 13, Math.sin(angle) * radius * 8];
  });
}

// Neuron groups as clusters of dots, active neurons lit red, each labelled by its region.
export function BrainActivityTab({ regions }: { regions: readonly BrainRegion[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const step = WIDTH / regions.length;
  const centers = regions.map((_, index) => step * index + step / 2);
  return (
    <div className="flex h-full flex-col px-2.5 pt-1 pb-2">
      <svg
        role="img"
        aria-label="Neuron groups of the brain, with the active ones lit red"
        viewBox={`0 2 ${WIDTH} 32`}
        preserveAspectRatio="xMidYMid meet"
        className="min-h-0 w-full flex-1"
      >
        {centers.slice(1).map((x, index) => {
          const from = centers[index] ?? x;
          const mid = (from + x) / 2;
          return (
            <path
              key={x}
              d={`M${from},${CENTER_Y} C${mid},${CENTER_Y - 12} ${mid},${CENTER_Y + 10} ${x},${CENTER_Y}`}
              fill="none"
              stroke={tokens.viz.networkWire}
              strokeOpacity={0.25}
              strokeWidth={0.5}
            />
          );
        })}
        {regions.map((region, index) => {
          const cx = centers[index] ?? 0;
          const dim = selected !== null && selected !== region.id;
          return (
            <g key={region.id} opacity={dim ? 0.35 : 1}>
              {scatter(index + 1, region.neurons).map(([dx, dy], dot) => {
                const active = dot < region.active;
                return (
                  <circle
                    // biome-ignore lint/suspicious/noArrayIndexKey: dots of a region never reorder.
                    key={dot}
                    cx={cx + dx}
                    cy={CENTER_Y + dy}
                    r={active ? 1.1 : 0.75}
                    fill={active ? tokens.viz.networkActive : tokens.viz.networkWire}
                    fillOpacity={active ? 1 : 0.45}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="grid shrink-0" style={{ gridTemplateColumns: `repeat(${regions.length}, minmax(0, 1fr))` }}>
        {regions.map((region) => (
          <Act
            key={region.id}
            cta={region.name}
            title={`${region.detail} · ${region.active} of ${region.neurons} shown firing`}
            aria-pressed={selected === region.id}
            onClick={() => setSelected(selected === region.id ? null : region.id)}
            className={`truncate rounded-control px-1 py-0.5 text-body hover:bg-fill-hover active:opacity-80 ${
              selected === region.id ? "text-fg" : "text-fg-secondary"
            }`}
          >
            {region.name}
          </Act>
        ))}
      </div>
    </div>
  );
}
