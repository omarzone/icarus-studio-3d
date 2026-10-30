// TAB-LIBRARY-COMMUNITY

import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { LibraryCards } from "./library-cards.tsx";
import { useLibraryShelf, usePreviewItem } from "./use-library.ts";

// Pieces published by others; dragging one in keeps a remix link to its creator.
export function CommunityTab({ scene, search }: { scene: string; search: string }) {
  const items = useLibraryShelf(scene, "community", search);
  const preview = usePreviewItem(scene);
  return (
    <QueryView
      query={items}
      isEmpty={(data) => data.length === 0}
      empty={
        <EmptyState
          title="No community pieces here yet"
          body="Worlds, bodies and brains others publish show up here."
        />
      }
    >
      {(data) => <LibraryCards items={data} onPreview={preview} />}
    </QueryView>
  );
}
