// TAB-IDEAS
import { Shuffle } from "lucide-react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import type { IdeaFilter, IdeaSet } from "../../ports/ideas-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { IdeaCard } from "./idea-card.tsx";
import { waysToBuildTitle } from "./ideas-route.ts";

export type IdeasTabProps = {
  set: IdeaSet;
  filter: IdeaFilter;
  onFilter: (filter: IdeaFilter) => void;
  onUse: (id: string) => void;
  onTweak: (id: string) => void;
  onMix: () => void;
};

const FILTERS: readonly { id: IdeaFilter; label: string }[] = [
  { id: "whole", label: "Whole idea" },
  { id: "worlds", label: "Worlds only" },
  { id: "bodies", label: "Bodies only" },
];

// The generated alternatives side by side, a filter to mix parts and a bar that proposes a mix.
export function IdeasTab({ set, filter, onFilter, onUse, onTweak, onMix }: IdeasTabProps) {
  return (
    <div className="@container flex h-full flex-col gap-3.5 overflow-y-auto p-4.5">
      <div className="flex flex-wrap items-end gap-3">
        <span className="flex flex-col gap-1">
          <h1 className="text-title-2 font-semibold">{waysToBuildTitle(set.ideas.length)}</h1>
          <span className="text-body leading-normal text-fg-tertiary">
            Each one is a real 3D world and body. Pick one, mix them, or describe what to change.
          </span>
        </span>
        <div role="radiogroup" aria-label="Show" className="ml-auto flex gap-0.5 rounded-button bg-control p-0.75">
          {FILTERS.map((item) => {
            const active = item.id === filter;
            return (
              <Act
                key={item.id}
                cta={item.label}
                role="radio"
                aria-checked={active}
                aria-current={active ? "true" : undefined}
                onClick={() => onFilter(item.id)}
                className={`rounded-control px-3.5 py-1.25 text-ui ${
                  active
                    ? "bg-selected font-semibold text-on-selected"
                    : "text-fg-secondary hover:bg-fill-hover hover:text-fg"
                }`}
              >
                {item.label}
              </Act>
            );
          })}
        </div>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-3.5 @2xl:grid-cols-3">
        {set.ideas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} onUse={() => onUse(idea.id)} onTweak={() => onTweak(idea.id)} />
        ))}
      </div>
      {set.mix ? (
        <div className="flex items-center gap-2 rounded-card-sm bg-control px-3.5 py-3">
          <Shuffle size={16} strokeWidth={1.75} className="shrink-0 text-fg-secondary" aria-hidden />
          <span>
            Mix them: the world from <b className="font-semibold">{set.mix.worldFrom}</b> with the body from{" "}
            <b className="font-semibold">{set.mix.bodyFrom}</b>
          </span>
          <GoTo
            to="STA-WORLD-BUILDING"
            cta="Mix and build"
            onClick={onMix}
            className={buttonClass("secondary", "ml-auto h-8.5! px-4! text-body!")}
          >
            Mix and build
          </GoTo>
        </div>
      ) : null}
    </div>
  );
}
