import type { LibraryItem, LibraryPort, LibraryShelf } from "./library-port.ts";

// Sample pieces from the design, used only by the prototype, the design gallery and tests.
const SHELVES: Readonly<Record<string, Readonly<Record<LibraryShelf, readonly LibraryItem[]>>>> = {
  "park-pilot": {
    library: [
      { id: "parking-lot", name: "Parking lot", kind: "environment" },
      { id: "empty-field", name: "Empty field", kind: "environment" },
      { id: "lot-grid", name: "16-lot grid", kind: "environment" },
      { id: "ice-arena", name: "Ice arena", kind: "environment" },
    ],
    community: [
      { id: "city-block", name: "City block", kind: "environment", source: "maya" },
      { id: "garage", name: "Underground garage", kind: "environment", source: "lee" },
    ],
    "my-files": [],
  },
  "new-project": {
    library: [
      { id: "parking-lot", name: "Parking lot", kind: "environment" },
      { id: "lots", name: "16 lots", kind: "environment" },
      { id: "car-agent", name: "Car agent", kind: "agent" },
      { id: "tripod", name: "Tripod robot", kind: "body" },
      { id: "humanoid", name: "Humanoid", kind: "body" },
    ],
    community: [{ id: "fly-body", name: "Fruit fly body", kind: "body", source: "ana" }],
    "my-files": [],
  },
};

export function createLibraryFixture(): LibraryPort {
  return {
    listItems: async ({ scene, shelf, search }) => {
      const items = SHELVES[scene]?.[shelf] ?? [];
      const query = search.trim().toLowerCase();
      return query ? items.filter((item) => item.name.toLowerCase().includes(query)) : [...items];
    },
    previewItem: async () => undefined,
  };
}
