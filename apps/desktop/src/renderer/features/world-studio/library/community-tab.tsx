// TAB-LIBRARY-COMMUNITY

import { useNavigation } from "../../../app/navigation/navigation-store.tsx";
import type { LibraryItem } from "../../../ports/library-port.ts";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { LibraryCards } from "./library-cards.tsx";
import { useLibraryShelf, usePreviewItem } from "./use-library.ts";

// Creations published by others; each is a whole project, so its card opens its page, where it can be remixed.
// A community that does not answer shows the not-connected state (QueryView), not an empty shelf.
export function CommunityTab({ scene, search }: { scene: string; search: string }) {
  const items = useLibraryShelf(scene, "community", search);
  const preview = usePreviewItem(scene);
  const go = useNavigation((state) => state.go);
  const open = (data: readonly LibraryItem[], id: string) => {
    const creation = data.find((item) => item.id === id)?.creation;
    if (creation) {
      go("SCR-CREATION", { creation });
      return;
    }
    preview(id);
  };
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
      {(data) => <LibraryCards items={data} onPreview={(id) => open(data, id)} />}
    </QueryView>
  );
}
