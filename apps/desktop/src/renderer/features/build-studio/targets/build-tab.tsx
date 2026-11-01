// TAB-BUILD
import { BrainCircuit, Cpu, Film, Gamepad2, Globe, type LucideIcon } from "lucide-react";
import type { RouteId } from "../../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";
import type { BuildTarget, BuildTargetKind } from "../../../ports/build-port.ts";

const TARGET_LOOK: Readonly<Record<BuildTargetKind, { label: string; icon: LucideIcon }>> = {
  community: { label: "Share to community", icon: Globe },
  "export-brain": { label: "Export brain", icon: BrainCircuit },
  hardware: { label: "Run on real hardware", icon: Cpu },
  game: { label: "Use in a game", icon: Gamepad2 },
  animation: { label: "Export animation", icon: Film },
};

type Props = {
  targets: readonly BuildTarget[];
  selected: BuildTargetKind;
  // Where each target leads; a target without a destination is shown in place.
  routes: Partial<Record<BuildTargetKind, RouteId>>;
  onSelect: (kind: BuildTargetKind) => void;
};

const rowClass = (active: boolean) =>
  `flex items-center gap-2.5 rounded-button p-2.5 text-left active:opacity-80 ${active ? "bg-control-raised" : "hover:bg-fill-hover"}`;

// What to do with the project: each target opens its view or its dialog.
export function BuildTab({ targets, selected, routes, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {targets.map((target) => {
        const { label, icon: Icon } = TARGET_LOOK[target.kind];
        const active = target.kind === selected;
        const to = routes[target.kind];
        const cta = `${label}\n${target.detail}`;
        const content = (
          <>
            <span className="grid size-7.5 shrink-0 place-items-center rounded-button bg-control">
              <Icon size={14} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="leading-4 font-semibold">{label}</span>
              <span className="text-meta leading-3.5 text-fg-tertiary">{target.detail}</span>
            </span>
          </>
        );
        return to ? (
          <GoTo
            key={target.kind}
            to={to}
            cta={cta}
            aria-current={active ? "true" : undefined}
            className={rowClass(active)}
          >
            {content}
          </GoTo>
        ) : (
          <Act
            key={target.kind}
            cta={cta}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(target.kind)}
            className={rowClass(active)}
          >
            {content}
          </Act>
        );
      })}
    </div>
  );
}
