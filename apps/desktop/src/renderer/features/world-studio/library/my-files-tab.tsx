// TAB-MY-FILES

import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { LibraryCards } from "./library-cards.tsx";
import { useLibraryShelf, usePreviewItem } from "./use-library.ts";

// Models, environments and videos this user imported.
export function MyFilesTab({ scene, search, importLabel }: { scene: string; search: string; importLabel: string }) {
  const items = useLibraryShelf(scene, "my-files", search);
  const preview = usePreviewItem(scene);
  return (
    <QueryView query={items}>
      {(data) =>
        data.length === 0 && search ? (
          <EmptyState title="No files match" />
        ) : (
          <LibraryCards items={data} onPreview={preview} importLabel={importLabel} />
        )
      }
    </QueryView>
  );
}
