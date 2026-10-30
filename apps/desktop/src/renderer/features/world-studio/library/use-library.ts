import { useQuery } from "@tanstack/react-query";
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
  const preview = useEngineAction(port.previewItem);
  return (id: string) => preview.mutate({ scene, id });
}
