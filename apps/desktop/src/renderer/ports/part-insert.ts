import type { ComponentSpec, EditOperation, ObjectSpec, Project } from "@icarus/contracts";
import { snapped, snappedScale } from "./object-transform.ts";

// Basic parts the World toolbar inserts, like the parts of a block building editor: static, plastic and on the grid.
export type PartShape = "box" | "sphere" | "cylinder" | "wedge" | "corner_wedge" | "capsule";

type PartKind = { shape: PartShape; label: string; id: string; size: readonly [number, number, number] };

export const PART_KINDS: readonly PartKind[] = [
  { shape: "box", label: "Block", id: "block", size: [2, 2, 1] },
  { shape: "sphere", label: "Sphere", id: "sphere", size: [1, 1, 1] },
  { shape: "cylinder", label: "Cylinder", id: "cylinder", size: [1, 1, 2] },
  { shape: "wedge", label: "Wedge", id: "wedge", size: [2, 2, 1] },
  { shape: "corner_wedge", label: "Corner wedge", id: "corner_wedge", size: [2, 2, 1] },
  { shape: "capsule", label: "Capsule", id: "capsule", size: [1, 1, 2] },
];

// The new part's color; it is project data like any other color, not interface styling.
const PART_COLOR = "#a3a2a5";
const FRICTION = 0.6;

type Vec3 = readonly [number, number, number];

export function partKind(shape: string): PartKind | undefined {
  return PART_KINDS.find((kind) => kind.shape === shape);
}

function takenIds(project: Project): Set<string> {
  return new Set([...project.world.objects, ...project.bodies.flatMap((body) => body.objects)].map((obj) => obj.id));
}

// The kind's id, or the first free numbered id after it ("block", "block_2", "block_3"…), with a matching name.
export function freePartName(project: Project, kind: PartKind): { id: string; name: string } {
  const taken = takenIds(project);
  if (!taken.has(kind.id)) {
    return { id: kind.id, name: kind.label };
  }
  let number = 2;
  while (taken.has(`${kind.id}_${number}`)) {
    number += 1;
  }
  return { id: `${kind.id}_${number}`, name: `${kind.label} ${number}` };
}

const vector = (value: Vec3) => ({
  type: "vector" as const,
  value: [value[0], value[1], value[2]] as [number, number, number],
});

// One static part resting on the point (its bottom on it), with the move snap applied across the ground.
export function partObject(project: Project, kind: PartKind, point: Vec3, step: number | null): ObjectSpec {
  const { id, name } = freePartName(project, kind);
  const position: Vec3 = [snapped(point[0], step), snapped(point[1], step), point[2] + kind.size[2] / 2];
  const components: ComponentSpec[] = [
    { id: "transform", kind: "transform", properties: { position: vector(position) } },
    {
      id: "mesh",
      kind: "mesh",
      properties: { shape: { type: "list", value: kind.shape }, size: vector(kind.size) },
    },
    {
      id: "material",
      kind: "material",
      properties: {
        color: { type: "color", value: PART_COLOR },
        preset: { type: "list", value: "plastic" },
        surface: { type: "list", value: "plastic" },
      },
    },
    {
      id: "physics_body",
      kind: "physics_body",
      properties: { mode: { type: "choice", value: "static" }, mass: { type: "number", value: 1 } },
    },
    { id: "collider", kind: "collider", properties: { friction: { type: "slider", value: FRICTION } } },
  ];
  return { id, name, parent: null, components };
}

export function insertPartOperation(project: Project, kind: PartKind, point: Vec3, step: number | null): EditOperation {
  return { op: "create_object", target: "world", object: partObject(project, kind, point, step) };
}

// A stretched Transform scale whose sides land on the move snap, for objects with a Mesh; others keep it as is.
export function sizedScale(
  obj: ObjectSpec,
  scale: readonly [number, number, number],
  step: number | null | undefined,
): [number, number, number] {
  const size = obj.components.find((component) => component.kind === "mesh")?.properties.size;
  if (size?.type !== "vector" || !step) {
    return [scale[0], scale[1], scale[2]];
  }
  const axis = (index: 0 | 1 | 2) => Math.round(snappedScale(scale[index], size.value[index], step) * 1000) / 1000;
  return [axis(0), axis(1), axis(2)];
}

// An older project's endless floor plane: a mesh plane without a ground component, which can become a slab.
export function isPlaneFloor(obj: ObjectSpec): boolean {
  const mesh = obj.components.find((component) => component.kind === "mesh");
  const shape = mesh?.properties.shape;
  return (
    shape?.type === "list" &&
    shape.value === "plane" &&
    !obj.components.some((component) => component.kind === "ground")
  );
}

// Thickness a converted plane's slab gets, as new projects start with.
const SLAB_THICKNESS = 1;

// Turns a plane floor into a slab of the plane's width and depth; its top stays where the plane was (ADR 010).
export function slabOperations(obj: ObjectSpec): EditOperation[] {
  const mesh = obj.components.find((component) => component.kind === "mesh");
  const size = mesh?.properties.size;
  const [width, depth] = size?.type === "vector" ? size.value : [100, 100];
  const ground: ComponentSpec = {
    id: obj.components.some((component) => component.id === "ground") ? "ground_slab" : "ground",
    kind: "ground",
    properties: { size: vector([width, depth, SLAB_THICKNESS]) },
  };
  return [{ op: "add_component", object: obj.id, component: ground }];
}
