// TAB-REWARD
import type { RewardKind, RewardTerm } from "../../../ports/brain-port.ts";
import { EmptyState } from "../../../ui/states.tsx";
import { ValueSlider } from "../value-slider.tsx";

type Props = { terms: readonly RewardTerm[]; onWeight: (id: string, weight: number) => void };

const FILL: Record<RewardKind, string> = {
  goal: "bg-fg",
  reward: "bg-fg-secondary",
  penalty: "bg-danger-graphic",
  cost: "bg-warn",
};

const VALUE_TONE: Record<RewardKind, string> = {
  goal: "text-fg",
  reward: "text-fg-secondary",
  penalty: "text-danger-graphic",
  cost: "text-warn",
};

function formatWeight(weight: number): string {
  const text = Math.abs(weight).toFixed(Math.abs(weight) < 0.1 ? 2 : 1);
  return weight < 0 ? `−${text}` : `+${text}`;
}

function roundWeight(value: number): number {
  return value < 0.1 ? Math.round(value * 100) / 100 : Math.round(value * 10) / 10;
}

// One card per reward term: name, signed weight, plain description and a slider for its size.
export function RewardTab({ terms, onWeight }: Props) {
  if (terms.length === 0) {
    return <EmptyState title="No reward yet" body="Describe what success looks like and the copilot proposes one." />;
  }
  return (
    <div className="grid h-full grid-cols-4 gap-2.5 px-3 pt-2.5 pb-3">
      {terms.map((term) => (
        <div key={term.id} className="flex flex-col gap-1.5 rounded-card-sm bg-control px-3 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold">{term.name}</span>
            <span className={`ml-auto font-mono text-ui ${VALUE_TONE[term.kind]}`}>{formatWeight(term.weight)}</span>
          </div>
          <span className="text-meta text-fg-secondary">{term.detail}</span>
          <ValueSlider
            label={`${term.name} weight`}
            fill={FILL[term.kind]}
            ratio={Math.abs(term.weight) / term.scale}
            valueText={formatWeight(term.weight)}
            onRatio={(ratio) => onWeight(term.id, (term.weight < 0 ? -1 : 1) * roundWeight(ratio * term.scale))}
          />
        </div>
      ))}
    </div>
  );
}
