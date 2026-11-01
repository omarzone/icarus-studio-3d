import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { libraryPort } from "../../ports/library-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { MenuButton, type MenuEntry } from "../../ui/menu.tsx";

// The explorer's + in the app: places a library piece in the world, the same edit as clicking it in the Library.
export function AddObjectMenu({ scene }: { scene: string }) {
  const port = usePort(libraryPort);
  const client = useQueryClient();
  const pieces = useQuery({
    queryKey: ["library", scene, "library", ""],
    queryFn: () => port.listItems({ scene, shelf: "library", search: "" }),
  });
  const place = useEngineAction(port.previewItem);
  const refresh = () =>
    client.invalidateQueries({
      predicate: (query) =>
        (query.queryKey[0] === "scene" && query.queryKey[1] === scene) ||
        query.queryKey[0] === "projects" ||
        query.queryKey[0] === "revisions",
    });
  const entries: MenuEntry[] =
    pieces.data && pieces.data.length > 0
      ? pieces.data.map((piece) => ({
          label: piece.name,
          hint: "Add it to the world",
          run: () => place.mutate({ scene, id: piece.id }, { onSuccess: () => void refresh() }),
        }))
      : [{ label: pieces.isError ? "The library could not be loaded" : "Loading the library…", run: () => undefined }];
  return (
    <MenuButton label="Add object" entries={entries} className={buttonClass("icon", "size-6!")}>
      <Plus size={14} strokeWidth={1.75} aria-hidden />
    </MenuButton>
  );
}
