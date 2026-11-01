import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type LibraryShelf, libraryPort } from "../../../ports/library-port.ts";

export function useLibraryShelf(scene: string, shelf: LibraryShelf, search: string) {
  const port = usePort(libraryPort);
  return useQuery({
    queryKey: ["library", scene, shelf, search],
    queryFn: () => port.listItems({ scene, shelf, search }),
  });
}

export function usePreviewItem(scene: string) {
  const port = usePort(libraryPort);
  const client = useQueryClient();
  const preview = useEngineAction(port.previewItem);
  // Placing a piece is an edit: the scene, the viewport and the history are re-read.
  const refresh = () =>
    client.invalidateQueries({
      predicate: (query) =>
        (query.queryKey[0] === "scene" && query.queryKey[1] === scene) ||
        query.queryKey[0] === "projects" ||
        query.queryKey[0] === "revisions",
    });
  return (id: string) => preview.mutate({ scene, id }, { onSuccess: () => void refresh() });
}
