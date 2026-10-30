import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createLibraryFixture } from "./library.fixture.ts";

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
};

export const libraryPort = definePort<LibraryPort>({
  app: {
    listItems: pending({
      key: "library.list",
      summary: "The library of ready-made pieces",
      sprint: 3,
      ids: ["SCR-WORLD", "STA-WORLD-EMPTY", "STA-WORLD-EMPTY-NOGUIDE"],
    }),
    previewItem: pending({
      key: "library.preview",
      summary: "Previewing a library piece in the world",
      sprint: 3,
      ids: ["SCR-WORLD", "STA-WORLD-EMPTY"],
    }),
  },
  prototype: createLibraryFixture,
});
