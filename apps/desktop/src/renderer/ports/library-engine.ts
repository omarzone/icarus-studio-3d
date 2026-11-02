import type { CreateObject, LibraryCatalog, Project } from "@icarus/contracts";
import type { LibraryItem, LibraryShelf } from "./library-port.ts";
import { allObjects } from "./scene-views.ts";

// Pieces sit this far from the spawn point along x, so they never land on the agent.
const PLACE_OFFSET = 3;
// Each further copy of a piece sits this far along y from the previous one.
const COPY_SPACING = 2;

export function libraryItems(catalog: LibraryCatalog, shelf: LibraryShelf, search: string): LibraryItem[] {
  // Community pieces arrive with the community; imported files with import.
  if (shelf !== "library") {
    return [];
  }
  const query = search.trim().toLowerCase();
  return (catalog.pieces ?? [])
    .filter((piece) => !query || piece.label.toLowerCase().includes(query))
    .map((piece) => ({ id: piece.id, name: piece.label, kind: "prop" }));
}

function spawnPosition(project: Project): [number, number, number] {
  const spawn = project.world.objects.find((obj) => obj.components.some((item) => item.kind === "spawn_point"));
  const position = spawn?.components.find((item) => item.kind === "transform")?.properties.position;
  return position?.type === "vector" ? [position.value[0], position.value[1], position.value[2]] : [0, 0, 0];
}

export function placePiece(project: Project, catalog: LibraryCatalog, pieceId: string): CreateObject {
  const piece = (catalog.pieces ?? []).find((item) => item.id === pieceId);
  if (!piece) {
    throw new Error(`${pieceId} is not in the library`);
  }
  const taken = new Set(allObjects(project).map((obj) => obj.id));
  let id = piece.object.id;
  let copies = 0;
  for (let n = 2; taken.has(id); n++) {
    id = `${piece.object.id}_${n}`;
    copies++;
  }
  const [x, y] = spawnPosition(project);
  const components = piece.object.components.map((component) => {
    const position = component.properties.position;
    if (component.kind !== "transform" || position?.type !== "vector") {
      return component;
    }
    const value: [number, number, number] = [x + PLACE_OFFSET, y + copies * COPY_SPACING, position.value[2]];
    const placed = { type: "vector" as const, value };
    return { ...component, properties: { ...component.properties, position: placed } };
  });
  const name = id === piece.object.id ? piece.object.name : `${piece.object.name} ${id.split("_").at(-1)}`;
  return { op: "create_object", target: "world", object: { ...piece.object, id, name, components } };
}
