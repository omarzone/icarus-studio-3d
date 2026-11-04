import type { SceneDescription } from "@icarus/contracts";
import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { createCommunityCatalog } from "./catalog-community.ts";
import { createLibraryFixture } from "./library.fixture.ts";
import { communityItems, libraryItems, pieceScene, placePiece } from "./library-engine.ts";
import { vaultBodyId, vaultBodyOperations } from "./vault-bodies.ts";

// Ready-made pieces the user drags into a world and vault bodies that become its agent; thumbnails are real 3D
// renders made by the engine.
export type LibraryShelf = "library" | "community" | "my-files";

export type LibraryItemKind = "environment" | "prop" | "agent" | "body" | "brain" | "model" | "video";

export type LibraryItem = {
  id: string;
  name: string;
  kind: LibraryItemKind;
  // Author for community pieces, file name for imported files.
  source?: string;
  // The library category the piece is listed under (Street, Nature…); items without one are not grouped.
  group?: string;
  // The community creation the card opens (SCR-CREATION): creations are whole projects, not pieces.
  creation?: string;
};

const COMMUNITY_SHELF_SIZE = 24;

export type LibraryPort = {
  // Pieces suggested for a project's scene, filtered by a search.
  listItems: (input: { scene: string; shelf: LibraryShelf; search: string }) => Promise<LibraryItem[]>;
  previewItem: (input: { scene: string; id: string }) => Promise<void>;
  // A still scene of a piece for its card; null where pieces have no geometry to draw (sample data).
  itemScene: ((id: string) => Promise<SceneDescription>) | null;
};

export const libraryPort = definePort<LibraryPort>({
  app: {
    listItems: async ({ shelf, search }) => {
      if (shelf === "community") {
        const query = { sort: "featured", category: null, search, limit: COMMUNITY_SHELF_SIZE } as const;
        return communityItems(await createCommunityCatalog().listCreations(query));
      }
      return libraryItems(await engineApi.library(), shelf, search);
    },
    previewItem: async ({ scene, id }) => {
      const [state, catalog] = await Promise.all([engineApi.project(scene), engineApi.library()]);
      const body = vaultBodyId(id);
      if (body) {
        const label = catalog.bodies?.find((item) => item.id === body)?.label ?? body;
        await engineApi.applyOperations(scene, vaultBodyOperations(state.project, catalog, body), `Added ${label}`);
        return;
      }
      const operation = placePiece(state.project, catalog, id);
      await engineApi.applyOperations(scene, [operation], `Placed ${operation.object.name}`);
    },
    itemScene: async (id) => {
      const body = vaultBodyId(id);
      if (body) {
        return engineApi.vaultBodyScene(body);
      }
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
