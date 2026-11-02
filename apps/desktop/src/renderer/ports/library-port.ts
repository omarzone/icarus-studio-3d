import type { SceneDescription } from "@icarus/contracts";
import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { createLibraryFixture } from "./library.fixture.ts";
import { libraryItems, pieceScene, placePiece } from "./library-engine.ts";

// Ready-made pieces the user drags into a world; thumbnails are real 3D renders made by the engine.
export type LibraryShelf = "library" | "community" | "my-files";

export type LibraryItemKind = "environment" | "prop" | "agent" | "body" | "brain" | "model" | "video";

export type LibraryItem = {
  id: string;
  name: string;
  kind: LibraryItemKind;
  // Author for community pieces, file name for imported files.
  source?: string;
};

export type LibraryPort = {
  // Pieces suggested for a project's scene, filtered by a search.
  listItems: (input: { scene: string; shelf: LibraryShelf; search: string }) => Promise<LibraryItem[]>;
  previewItem: (input: { scene: string; id: string }) => Promise<void>;
  // A still scene of a piece for its card; null where pieces have no geometry to draw (sample data).
  itemScene: ((id: string) => Promise<SceneDescription>) | null;
};

export const libraryPort = definePort<LibraryPort>({
  app: {
    listItems: async ({ shelf, search }) => libraryItems(await engineApi.library(), shelf, search),
    previewItem: async ({ scene, id }) => {
      const [state, catalog] = await Promise.all([engineApi.project(scene), engineApi.library()]);
      const operation = placePiece(state.project, catalog, id);
      await engineApi.applyOperations(scene, [operation], `Placed ${operation.object.name}`);
    },
    itemScene: async (id) => {
      const piece = ((await engineApi.library()).pieces ?? []).find((item) => item.id === id);
      const scene = piece ? pieceScene(piece) : null;
      if (!scene) {
        throw new Error(`${id} has no shape to draw`);
      }
      return scene;
    },
  },
  prototype: createLibraryFixture,
});
