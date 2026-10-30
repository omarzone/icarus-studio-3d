import { ArrowBigUp } from "lucide-react";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { GoTo } from "../../app/navigation/go-to.tsx";
import type { CreationSummary } from "../../ports/community-port.ts";
import { compactNumber } from "../../ui/compact-number.ts";

const SORTS = [
  { label: "Featured", sort: "featured" },
  { label: "Recent", sort: "recent" },
  { label: "Most voted", sort: "most-voted" },
] as const;

export function CommunityStripHeader() {
  return (
    <div className="flex items-center gap-3.5">
      <h2 className="m-0 text-title-3 leading-tight font-semibold">From the community</h2>
      <div className="flex gap-0.5 rounded-button bg-control p-[3px]">
        {SORTS.map(({ label, sort }) => (
          <GoTo
            key={sort}
            to="SCR-COMMUNITY"
            cta={label}
            params={{ sort }}
            aria-current={sort === "featured" ? "true" : undefined}
            className={
              sort === "featured"
                ? "rounded-control bg-selected px-3.5 py-1.25 text-ui leading-tight font-semibold text-on-selected"
                : "rounded-control px-3.5 py-1.25 text-ui leading-tight text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80"
            }
          >
            {label}
          </GoTo>
        ))}
      </div>
      <GoTo
        to="SCR-COMMUNITY"
        cta="View all"
        params={{ sort: "featured" }}
        className="ml-auto text-fg-tertiary hover:text-fg active:opacity-80"
      >
        View all
      </GoTo>
    </div>
  );
}

export function opensCreation(creation: CreationSummary): { to: RouteId; params: Record<string, string> } {
  return creation.opensIn === "brain"
    ? { to: "STA-BRAIN-CONNECTOME", params: { creation: creation.id } }
    : { to: "SCR-CREATION", params: { creation: creation.id } };
}

export function CommunityStrip({ creations }: { creations: readonly CreationSummary[] }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {creations.map((creation) => {
        const votes = compactNumber(creation.votes);
        const target = opensCreation(creation);
        return (
          <div key={creation.id} className="relative">
            <GoTo
              to={target.to}
              params={target.params}
              cta={`${votes}\n${creation.name}\nby ${creation.author.handle} · ${votes} votes\nRemix`}
              className="flex w-full flex-col gap-2 rounded-card text-left hover:opacity-90 active:opacity-80"
            >
              <span className="relative h-37.5 w-full rounded-card bg-control">
                <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-overlay px-2 py-0.75 text-meta">
                  <ArrowBigUp size={12} strokeWidth={1.75} aria-hidden />
                  {votes}
                </span>
              </span>
              <span className="flex flex-col gap-0.5 pr-18">
                <span className="leading-tight font-semibold">{creation.name}</span>
                <span className="text-ui leading-tight text-fg-tertiary">
                  by {creation.author.handle} · {votes} votes
                </span>
              </span>
            </GoTo>
            <GoTo
              to="STA-WORLD-EMPTY"
              cta="Remix"
              params={{ remix: creation.id }}
              className="absolute right-0 bottom-0.5 flex h-7 items-start rounded-full bg-control px-3 text-ui leading-tight hover:bg-control-raised active:opacity-80"
            >
              <span>Remix</span>
            </GoTo>
          </div>
        );
      })}
    </div>
  );
}
