import { tokens } from "@icarus/ui-tokens";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePort } from "../../app/runtime/port.tsx";
import { useLiveBrain } from "../../editor/brain-activity/use-live-brain.ts";
import { brainPort, type NetworkColumn, type NetworkView, type NeuronState } from "../../ports/brain-port.ts";

const HEIGHT = 430;
const MIDDLE = 215;
const COLUMN_X = [96, 250, 400, 548] as const;
const NODE_FILL: Record<NeuronState, string | undefined> = {
  hot: tokens.viz.networkActive,
  on: undefined,
  idle: tokens.viz.networkIdle,
};

const columnX = (index: number, count: number) => COLUMN_X[index] ?? 96 + (index * 452) / Math.max(1, count - 1);

function nodeY(index: number, count: number): number {
  const spacing = Math.min(56.7, 328 / Math.max(1, count - 1));
  return MIDDLE + (index - (count - 1) / 2) * spacing;
}

const networkKey = (brain: string, checkpoint: string | null) => ["brain", brain, "network", checkpoint] as const;

// Checkpoints the diagram can show (Live and saved ones) and the one shown by default; none until the network is loaded.
export function useNetworkCheckpoints(brain: string | null): { checkpoints: readonly string[]; shown: string | null } {
  const port = usePort(brainPort);
  const query = useQuery({
    queryKey: networkKey(brain ?? "", null),
    queryFn: () => port.getNetwork({ brain: brain ?? "" }),
    enabled: brain !== null,
  });
  return { checkpoints: query.data?.checkpoints ?? [], shown: query.data?.checkpoint ?? null };
}

// The body's senses wired into the network: hot neurons and connections lit red, drawn from the engine's network state.
export function NetworkDiagram({ brain, checkpoint }: { brain: string; checkpoint: string | null }) {
  const port = usePort(brainPort);
  useLiveBrain(brain);
  const query = useQuery({
    queryKey: networkKey(brain, checkpoint),
    queryFn: () => port.getNetwork({ brain, checkpoint: checkpoint ?? undefined }),
    placeholderData: keepPreviousData,
  });
  const network = query.data;
  if (!network || network.columns.length === 0) {
    return null;
  }
  return (
    <>
      <div className="pointer-events-none absolute top-2.5 right-2.5 bottom-15 left-59">
        <svg
          role="img"
          aria-label={`${network.name} brain as a network, lit up by what it senses right now`}
          width="100%"
          height="100%"
          viewBox={`0 0 640 ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <Wires network={network} />
          {network.columns.map((column, index) => (
            <Column key={column.label} column={column} index={index} count={network.columns.length} />
          ))}
          <Focus network={network} />
        </svg>
      </div>
      <div className="pointer-events-none absolute bottom-3.5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5 text-center">
        <span className="text-[20px] leading-6 font-bold">{network.name}</span>
        <span className="text-body text-fg-secondary">{network.summary}</span>
      </div>
    </>
  );
}

function Wires({ network }: { network: NetworkView }) {
  const columns = network.columns;
  const inputs = columns[0]?.nodes ?? [];
  return (
    <g>
      {inputs.map((node, index) => {
        const y = nodeY(index, inputs.length);
        const hot = node.state === "hot";
        return (
          <path
            key={`sense-${node.label ?? index}`}
            d={`M0,${MIDDLE} C60,${MIDDLE} 70,${y} 88,${y}`}
            fill="none"
            stroke={hot ? tokens.color.fg.default : tokens.viz.networkWire}
            strokeOpacity={hot ? 0.85 : 0.25}
            strokeWidth={hot ? 2 : 1}
          />
        );
      })}
      {columns.slice(1).map((column, index) => {
        const from = columns[index]?.nodes ?? [];
        const x1 = columnX(index, columns.length);
        const x2 = columnX(index + 1, columns.length);
        return from.flatMap((_, i) =>
          column.nodes
            .map((__, j) => j)
            .filter((j) => (i + j) % 4 === 0)
            .map((j) => (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: wires between fixed neuron positions never reorder.
                key={`${index}-${i}-${j}`}
                x1={x1}
                y1={nodeY(i, from.length)}
                x2={x2}
                y2={nodeY(j, column.nodes.length)}
                stroke={tokens.viz.networkWire}
                strokeOpacity={0.12}
                strokeWidth={0.8}
              />
            )),
        );
      })}
      {network.links.map((link) => {
        const from = columns[link.column]?.nodes.length ?? 1;
        const to = columns[link.column + 1]?.nodes.length ?? 1;
        return (
          <line
            key={`${link.column}-${link.from}-${link.to}`}
            x1={columnX(link.column, columns.length)}
            y1={nodeY(link.from, from)}
            x2={columnX(link.column + 1, columns.length)}
            y2={nodeY(link.to, to)}
            stroke={tokens.viz.networkActive}
            strokeOpacity={0.55}
            strokeWidth={1.6}
          />
        );
      })}
    </g>
  );
}

function Column({ column, index, count }: { column: NetworkColumn; index: number; count: number }) {
  const x = columnX(index, count);
  const last = index === count - 1;
  const outer = index === 0 || last;
  return (
    <g>
      {column.nodes.map((node, i) => {
        const y = nodeY(i, column.nodes.length);
        const fill = NODE_FILL[node.state];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: neurons of a layer keep their order.
          <g key={i}>
            <circle cx={x} cy={y} r={outer ? 7 : 4.5} fill={fill} className={fill ? undefined : "fill-fg"} />
            {node.label ? (
              <text
                x={last ? x + 16 : x - 14}
                y={y + 4}
                textAnchor={last ? "start" : "end"}
                fontSize={last ? 12 : 11}
                fontWeight={last ? 600 : 400}
                className={last ? "fill-fg" : "fill-fg-secondary"}
              >
                {node.label}
              </text>
            ) : null}
          </g>
        );
      })}
      <text x={x} y={422} textAnchor="middle" fontSize={11} className="fill-fg-tertiary">
        {column.label}
      </text>
    </g>
  );
}

function Focus({ network }: { network: NetworkView }) {
  const focus = network.focus;
  const column = focus ? network.columns[focus.column] : undefined;
  if (!focus || !column) {
    return null;
  }
  const x = columnX(focus.column, network.columns.length);
  const y = nodeY(focus.node, column.nodes.length);
  return (
    <g>
      <circle cx={x} cy={y} r={5} fill="none" strokeWidth={1.5} className="stroke-fg" />
      <rect x={x - 224} y={y - 38} width={210} height={52} rx={10} className="fill-fg" />
      <text x={x - 212} y={y - 18} fontSize={11} fontWeight={700} className="fill-on-selected">
        {focus.title}
      </text>
      <text x={x - 212} y={y - 2} fontSize={11} className="fill-on-selected">
        {focus.detail}
      </text>
    </g>
  );
}
