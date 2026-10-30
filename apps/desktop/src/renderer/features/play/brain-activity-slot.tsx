import { tokens } from "@icarus/ui-tokens";
import type { ActivityRegion } from "../../ports/play-port.ts";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { usePlaySession } from "./use-play-session.ts";

const WIDTH = 400;
const HEIGHT = 110;

// Stable positions for the neurons of a region, scattered around its cluster center.
function dots(region: ActivityRegion, index: number, count: number) {
  const center = ((index + 0.5) / count) * WIDTH;
  return Array.from({ length: region.total }, (_, dot) => {
    const angle = dot * 2.399;
    const spread = Math.sqrt((dot + 1) / region.total);
    return {
      x: center + Math.cos(angle) * spread * 34,
      y: 44 + Math.sin(angle) * spread * 16,
      active: dot % Math.max(1, Math.round(region.total / Math.max(1, region.active))) === 0,
    };
  });
}

// Neuron activity of a connectome brain in Play, region by region; active neurons are lit.
export function BrainActivitySlot({ project, className = "" }: { project: string; className?: string }) {
  const session = usePlaySession(project);
  const live = session.data?.activity?.live ?? false;
  return (
    <Panel
      id="PNL-BRAIN-ACTIVITY"
      className={className}
      tabs={<PanelTab label="Brain activity" active />}
      options={live ? <span className="text-ui text-danger">● live</span> : undefined}
    >
      <QueryView query={session}>
        {(data) => {
          const regions = data.activity?.regions ?? [];
          return (
            <svg
              role="img"
              aria-label="Neuron activity by region"
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-full w-full px-2.5 pt-1 pb-2"
            >
              {regions.map((region, index) => (
                <g key={region.name}>
                  {dots(region, index, regions.length).map((dot, dotIndex) => (
                    <circle
                      // biome-ignore lint/suspicious/noArrayIndexKey: neurons keep their place in the region.
                      key={dotIndex}
                      cx={dot.x}
                      cy={dot.y}
                      r={dot.active ? 1.8 : 1.2}
                      fill={dot.active ? tokens.viz.networkActive : tokens.viz.networkWire}
                      fillOpacity={dot.active ? 0.9 : 0.5}
                    />
                  ))}
                  <text
                    x={((index + 0.5) / regions.length) * WIDTH}
                    y={HEIGHT - 12}
                    textAnchor="middle"
                    className="fill-fg-tertiary text-[6px]"
                  >
                    {region.name}
                  </text>
                </g>
              ))}
            </svg>
          );
        }}
      </QueryView>
    </Panel>
  );
}
