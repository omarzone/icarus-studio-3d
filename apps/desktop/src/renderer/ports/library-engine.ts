import type {
  ComponentSpec,
  CreateObject,
  LibraryCatalog,
  PieceInfo,
  Project,
  SceneDescription,
  SceneGeom,
  SceneLight,
} from "@icarus/contracts";
import { multiply, type Quaternion } from "../scene/quaternion.ts";
import type { LibraryItem, LibraryShelf } from "./library-port.ts";
import { pieceLook } from "./piece-look.ts";
import { allObjects } from "./scene-views.ts";

// Pieces sit this far from the spawn point along x, so they never land on the agent.
const PLACE_OFFSET = 3;
// Each further copy of a piece sits this far along y from the previous one.
const COPY_SPACING = 2;

// Labels of the library's piece categories; the panel lists them in the engine's order.
const GROUPS: Record<NonNullable<PieceInfo["category"]>, string> = {
  basics: "Basics",
  street: "Street",
  buildings: "Buildings",
  furniture: "Furniture",
  nature: "Nature",
  props: "Props",
};

export function libraryItems(catalog: LibraryCatalog, shelf: LibraryShelf, search: string): LibraryItem[] {
  // Community pieces arrive with the community; imported files with import.
  if (shelf !== "library") {
    return [];
  }
  const query = search.trim().toLowerCase();
  return (catalog.pieces ?? [])
    .filter((piece) => !query || piece.label.toLowerCase().includes(query))
    .map((piece) => ({ id: piece.id, name: piece.label, kind: "prop", group: GROUPS[piece.category ?? "basics"] }));
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

type Shape = SceneGeom["shape"];
const SHAPES: readonly Shape[] = ["box", "sphere", "capsule", "cylinder"];
const FLOOR_COLOR = "#4b5563";
const FLOOR_SIZE = 20;

function property(components: readonly ComponentSpec[], kind: string, name: string) {
  return components.find((component) => component.kind === kind)?.properties[name];
}

function vectorOf(components: readonly ComponentSpec[], kind: string, name: string, fallback: number) {
  const value = property(components, kind, name);
  return value?.type === "vector" ? value.value : ([fallback, fallback, fallback] as const);
}

function axisTurn(axis: 0 | 1 | 2, degrees: number): Quaternion {
  const half = (degrees * Math.PI) / 360;
  const turn: [number, number, number, number] = [Math.cos(half), 0, 0, 0];
  turn[axis + 1] = Math.sin(half);
  return turn;
}

// Intrinsic XYZ degrees, as the engine's compiler reads a transform's rotation.
function rotationQuaternion([x, y, z]: readonly number[]): [number, number, number, number] {
  const [w, qx, qy, qz] = multiply(multiply(axisTurn(0, x ?? 0), axisTurn(1, y ?? 0)), axisTurn(2, z ?? 0));
  return [w, qx, qy, qz];
}

// A still scene of one library piece on a floor, from the shape, size, color, tilt and look it carries.
export function pieceScene(piece: PieceInfo): SceneDescription | null {
  const { components } = piece.object;
  const shapeValue = property(components, "mesh", "shape");
  const named = shapeValue?.type === "list" || shapeValue?.type === "choice" ? shapeValue.value : null;
  const shape = SHAPES.find((item) => item === named);
  if (!shape) {
    return null;
  }
  const size = vectorOf(components, "mesh", "size", 1);
  const scale = vectorOf(components, "transform", "scale", 1);
  const extents: [number, number, number] = [size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]];
  const height = shape === "sphere" ? extents[0] : extents[2];
  const color = property(components, "material", "color");
  const geom: SceneGeom = {
    name: piece.object.id,
    body: piece.object.id,
    shape,
    size: extents,
    position: [0, 0, height / 2],
    quaternion: rotationQuaternion(vectorOf(components, "transform", "rotation", 0)),
    color: color?.type === "color" ? color.value : FLOOR_COLOR,
    ...pieceLook(components),
  };
  const floor: SceneGeom = {
    name: "floor",
    body: "world",
    shape: "plane",
    size: [FLOOR_SIZE, FLOOR_SIZE, 0],
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    color: FLOOR_COLOR,
  };
  const light: SceneLight = { name: "sun", position: [2, -2, 4], direction: [-0.4, 0.4, -0.8], intensity: 0.8 };
  return { revision: 0, bodies: [], geoms: [floor, geom], lights: [light] };
}
