// TAB-LIBRARY

import { useState } from "react";
import { Act } from "../../../app/navigation/go-to.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type LibraryItem, libraryPort } from "../../../ports/library-port.ts";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { LibraryCards } from "./library-cards.tsx";
import { useLibraryShelf, usePreviewItem } from "./use-library.ts";

type Props = { scene: string; search: string; importLabel: string };

// Built-in environments, props, agents and bodies; the last card imports a model.
export function LibraryTab({ scene, search, importLabel }: Props) {
  const items = useLibraryShelf(scene, "library", search);
  const preview = usePreviewItem(scene);
  const port = usePort(libraryPort);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <QueryView query={items}>
      {(data) => {
        if (data.length === 0 && search) {
          return <EmptyState title="Nothing matches" body="Try another word, or ask the copilot to make it." />;
        }
        const groups = libraryGroups(data);
        // A search looks through every category; otherwise one category shows at a time.
        const group = search || groups.length === 0 ? null : groups.includes(picked ?? "") ? picked : groups[0];
        const shown = group ? data.filter((item) => item.group === group) : data;
        return (
          <div className="flex h-full min-h-0">
            {group ? (
              <nav
                aria-label="Categories"
                className="flex shrink-0 flex-col gap-px overflow-x-hidden overflow-y-auto py-2.5 pl-3"
              >
                {groups.map((label) => (
                  <Act
                    key={label}
                    cta={label}
                    aria-current={label === group ? "true" : undefined}
                    onClick={() => setPicked(label)}
                    className={
                      label === group
                        ? "rounded-control bg-selected px-2.5 py-0.5 text-left text-meta font-semibold text-on-selected"
                        : "rounded-control px-2.5 py-0.5 text-left text-meta text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80"
                    }
                  >
                    {label}
                  </Act>
                ))}
              </nav>
            ) : null}
            <div className="min-w-0 flex-1">
              <LibraryCards items={shown} onPreview={preview} importLabel={importLabel} scene={port.itemScene} />
            </div>
          </div>
        );
      }}
    </QueryView>
  );
}

// The categories of a shelf's items in the order they first appear.
export function libraryGroups(items: readonly LibraryItem[]): string[] {
  return [...new Set(items.flatMap((item) => (item.group ? [item.group] : [])))];
}
