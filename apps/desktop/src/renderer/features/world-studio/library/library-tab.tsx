// TAB-LIBRARY

import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { LibraryCards } from "./library-cards.tsx";
import { useLibraryShelf, usePreviewItem } from "./use-library.ts";

type Props = { scene: string; search: string; importLabel: string };

// Built-in environments, props, agents and bodies; the last card imports a model.
export function LibraryTab({ scene, search, importLabel }: Props) {
  const items = useLibraryShelf(scene, "library", search);
  const preview = usePreviewItem(scene);
  return (
    <QueryView query={items}>
      {(data) =>
        data.length === 0 && search ? (
          <EmptyState title="Nothing matches" body="Try another word, or ask the copilot to make it." />
        ) : (
          <LibraryCards items={data} onPreview={preview} importLabel={importLabel} />
        )
      }
    </QueryView>
  );
}
