// MOD-BRAIN-SIZES
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Target, Timer } from "lucide-react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type BrainSize, brainPort } from "../../ports/brain-port.ts";
import { ActionButton } from "../../ui/action-button.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { dialogButtonClass } from "../../ui/dialog-button.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { StatusPill } from "../../ui/status-pill.tsx";
import { brainShapeKey } from "./brain-shape/brain-shape-panel.tsx";

const BRAIN = "park-pilot";

// Three brain sizes with honest trade-offs: training time on this computer and the expected result.
export function SizesDialog() {
  const port = usePort(brainPort);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["brain", BRAIN, "sizes"], queryFn: () => port.getSizes(BRAIN) });
  const choose = (id: string) => async () => {
    const shape = await port.chooseSize({ brain: BRAIN, id });
    client.setQueryData(brainShapeKey(BRAIN), shape);
  };
  return (
    <Dialog title="Brain sizes Icarus suggests" width="w-201">
      <QueryView query={query}>
        {(data) => (
          <>
            <p className="-mt-1 text-body text-fg-secondary">{data.note}</p>
            <div className="grid grid-cols-3 gap-3">
              {data.sizes.map((size) => (
                <SizeCard key={size.id} size={size} onUse={choose(size.id)} />
              ))}
            </div>
            <div className="flex items-center gap-2.5 rounded-[14px] bg-control px-3.5 py-3">
              <Brain size={18} strokeWidth={1.75} aria-hidden />
              <span className="flex-1 text-body">Or start from a brain someone already trained</span>
              <GoTo to="SCR-COMMUNITY" cta="Browse brains" className={dialogButtonClass("secondary")}>
                Browse brains
              </GoTo>
            </div>
          </>
        )}
      </QueryView>
    </Dialog>
  );
}

function SizeCard({ size, onUse }: { size: BrainSize; onUse: () => Promise<void> }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-card bg-control p-3.5 ${size.recommended ? "shadow-[inset_0_0_0_1.5px_var(--ic-fg)]" : ""}`}
    >
      <div className="flex items-center">
        <span className="text-headline font-semibold">{size.label}</span>
        {size.recommended ? (
          <span className="ml-auto">
            <StatusPill tone="ok">Recommended</StatusPill>
          </span>
        ) : null}
      </div>
      <span className="text-ui text-fg-secondary">{size.shape}</span>
      <MiniNetwork layers={size.diagram} />
      <div className="flex flex-col gap-1 text-ui">
        <span className="flex items-center gap-1.5">
          <Timer size={13} strokeWidth={1.75} aria-hidden />
          {size.time}
        </span>
        <span className="flex items-center gap-1.5">
          <Target size={13} strokeWidth={1.75} aria-hidden />
          {size.expected}
        </span>
      </div>
      <ActionButton
        cta={`Use ${size.label}`}
        to="STA-BRAIN-NETWORK"
        run={onUse}
        className={
          size.recommended
            ? dialogButtonClass("primary", "justify-start!")
            : dialogButtonClass("secondary", "justify-start!")
        }
      >
        Use {size.label}
      </ActionButton>
    </div>
  );
}

// Neurons per layer as columns of dots, every neighbor pair joined by a faint line.
function MiniNetwork({ layers }: { layers: readonly number[] }) {
  const x = (index: number) => 20 + (index * 180) / Math.max(1, layers.length - 1);
  const y = (index: number, count: number) =>
    45 + (index - (count - 1) / 2) * Math.min(14, 74 / Math.max(1, count - 1));
  return (
    <svg aria-hidden width="100%" height="90" viewBox="0 0 220 90">
      {layers.slice(1).map((count, column) => {
        const previous = layers[column] ?? 0;
        return Array.from({ length: previous }, (_, i) =>
          Array.from({ length: count }, (__, j) => (
            <line
              // biome-ignore lint/suspicious/noArrayIndexKey: wires between fixed neuron positions never reorder.
              key={`${column}-${i}-${j}`}
              x1={x(column)}
              y1={y(i, previous)}
              x2={x(column + 1)}
              y2={y(j, count)}
              strokeWidth={0.8}
              className="stroke-fill-track-off"
            />
          )),
        );
      })}
      {layers.map((count, column) =>
        Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: dots of a layer keep their order.
          <circle key={`${column}-${i}`} cx={x(column)} cy={y(i, count)} r={4} className="fill-fg" />
        )),
      )}
    </svg>
  );
}
