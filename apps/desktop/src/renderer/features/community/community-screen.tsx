// SCR-COMMUNITY
import { useQuery } from "@tanstack/react-query";
import { ArrowBigUp } from "lucide-react";
import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type CreationSort, type CreationSummary, communityPort } from "../../ports/community-port.ts";
import { Avatar } from "../../ui/avatar.tsx";
import { compactNumber } from "../../ui/compact-number.ts";
import { LauncherPage } from "../../ui/launcher-page.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { Segmented } from "../../ui/segmented.tsx";
import { EmptyState } from "../../ui/states.tsx";

const SORTS: readonly { label: string; sort: CreationSort }[] = [
  { label: "Featured", sort: "featured" },
  { label: "Recent", sort: "recent" },
  { label: "Most voted", sort: "most-voted" },
];

function sortFrom(value: string | undefined): CreationSort {
  return SORTS.find((item) => item.sort === value)?.sort ?? "most-voted";
}

export function CommunityScreen() {
  const params = useNavigation((state) => state.params);
  const community = usePort(communityPort);
  const [sort, setSort] = useState<CreationSort>(() => sortFrom(params.sort));
  const [category, setCategory] = useState<string | null>(null);
  const search = params.search ?? "";
  const categories = useQuery({ queryKey: ["community", "categories"], queryFn: community.listCategories });
  const creations = useQuery({
    queryKey: ["community", sort, category, search],
    queryFn: () => community.listCreations({ sort, category, search }),
  });
  return (
    <LauncherPage active="Community">
      <div className="flex flex-col gap-4.5 pt-1.5">
        <div className="flex items-center gap-3.5">
          <h1 className="m-0 text-title-1 leading-tight font-semibold">Community</h1>
          <Segmented
            items={SORTS.map((item) => ({
              label: item.label,
              active: item.sort === sort,
              onSelect: () => setSort(item.sort),
            }))}
          />
          <span className="ml-auto text-ui leading-tight text-fg-tertiary">
            Every creation is reviewed before it is public
          </span>
        </div>
        <div className="flex gap-2">
          {[null, ...(categories.data ?? [])].map((item) => (
            <CategoryChip
              key={item ?? "all"}
              label={item ?? "All"}
              active={item === category}
              onSelect={() => setCategory(item)}
            />
          ))}
        </div>
        <QueryView
          query={creations}
          isEmpty={(list) => list.length === 0}
          empty={<EmptyState title="No creations found" body="Try another category or search." />}
        >
          {(list) => (
            <div className="grid grid-cols-4 gap-4.5">
              {list.map((creation) => (
                <CreationCard key={creation.id} creation={creation} />
              ))}
            </div>
          )}
        </QueryView>
      </div>
    </LauncherPage>
  );
}

function CategoryChip({ label, active, onSelect }: { label: string; active: boolean; onSelect: () => void }) {
  return (
    <Act
      cta={label}
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
      className={
        active
          ? "rounded-full bg-selected px-3 py-1.5 text-ui leading-tight font-semibold text-on-selected"
          : "rounded-full bg-control px-3 py-1.5 text-ui leading-tight hover:bg-control-raised active:opacity-80"
      }
    >
      {label}
    </Act>
  );
}

function CreationCard({ creation }: { creation: CreationSummary }) {
  const votes = compactNumber(creation.votes);
  const { author } = creation;
  return (
    <GoTo
      to={creation.opensIn === "brain" ? "STA-BRAIN-CONNECTOME" : "SCR-CREATION"}
      params={{ creation: creation.id }}
      cta={`${votes}\n${author.initials}\n${creation.name}\n@${author.handle} · ${creation.remixes} remixes`}
      className="flex flex-col gap-2 rounded-card text-left hover:opacity-90 active:opacity-80"
    >
      <span className="relative h-37.5 w-full rounded-card bg-control">
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-overlay px-2 py-0.75 text-meta">
          <ArrowBigUp size={12} strokeWidth={1.75} aria-hidden />
          {votes}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <Avatar initials={author.initials} tone={author.tone} className="size-6.5 text-micro" />
        <span className="flex flex-col">
          <span className="leading-tight font-semibold">{creation.name}</span>
          <span className="text-meta leading-tight text-fg-tertiary">
            @{author.handle} · {creation.remixes} remixes
          </span>
        </span>
      </span>
    </GoTo>
  );
}
