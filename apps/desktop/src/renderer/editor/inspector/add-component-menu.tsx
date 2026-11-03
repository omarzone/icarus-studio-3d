import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type ComponentGroup, scenePort } from "../../ports/scene-port.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { SCENE_ICONS } from "../scene-icons.ts";
import { sceneKeys } from "../scene-queries.ts";

type Props = {
  onPick: (kind: string) => void;
  // Highlighted kind (keyboard or pointer focus from the search).
  highlighted?: string;
  // Component ids the object already has; a unique kind among them cannot be added again.
  taken?: readonly string[];
};

// The Add component picker: search or describe, then components grouped by what they do.
export function AddComponentMenu({ onPick, highlighted, taken = [] }: Props) {
  const port = usePort(scenePort);
  const groups = useQuery({ queryKey: sceneKeys.componentKinds, queryFn: () => port.listComponentKinds() });
  const [search, setSearch] = useState("");
  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 rounded-bubble border border-line-strong bg-panel p-2.5 shadow-popover">
      <label className="col-span-2 flex h-8 items-center gap-2 rounded-button bg-control px-2.5 text-ui text-fg-tertiary hover:bg-control-raised">
        <Search size={13} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          aria-label="Search components"
          placeholder="Search components, or describe one"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-tertiary"
        />
      </label>
      <QueryView query={groups}>
        {(data) =>
          filtered(data, search).map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <span className="px-2.5 pt-1.5 pb-0.5 text-meta text-fg-tertiary">{group.label}</span>
              {group.kinds.map((kind) => {
                const Icon = SCENE_ICONS[kind.icon];
                const had = kind.unique === true && taken.includes(kind.id);
                return (
                  <Act
                    key={kind.id}
                    cta={kind.label}
                    disabled={had}
                    title={had ? `This object already has a ${kind.label}; it can have only one` : undefined}
                    onClick={() => onPick(kind.id)}
                    className={`flex items-center gap-2.25 rounded-control px-2.5 py-1.5 text-left text-ui leading-tight disabled:opacity-40 ${
                      kind.id === highlighted ? "bg-control hover:bg-control-raised" : "hover:bg-fill-hover"
                    }`}
                  >
                    <Icon size={14} strokeWidth={1.75} aria-hidden />
                    {kind.label}
                  </Act>
                );
              })}
            </div>
          ))
        }
      </QueryView>
    </div>
  );
}

function filtered(groups: readonly ComponentGroup[], search: string): ComponentGroup[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return [...groups];
  }
  return groups
    .map((group) => ({ ...group, kinds: group.kinds.filter((kind) => kind.label.toLowerCase().includes(query)) }))
    .filter((group) => group.kinds.length > 0);
}
