import type { ComponentSpec, SceneGeom } from "@icarus/contracts";

type Style = NonNullable<SceneGeom["style"]>;
type Surface = NonNullable<SceneGeom["surface"]>;
type Finish = NonNullable<SceneGeom["finish"]>;

// Every value the contract allows, as records so a new one breaks the build until it is listed here.
const STYLES: Record<Style, true> = {
  plain: true,
  car_body: true,
  wheel: true,
  shell: true,
  joint: true,
  crate: true,
  wall: true,
  post: true,
  cone: true,
  ball: true,
  lamp_post: true,
  curb: true,
  marking: true,
  tree: true,
  stairs: true,
  step: true,
  slab: true,
  pillar: true,
  planks: true,
  speed_bump: true,
  wheel_stop: true,
  barrier: true,
  fence: true,
  sign: true,
  building: true,
  house: true,
  garage: true,
  table: true,
  bench: true,
  shelf: true,
  bush: true,
  rock: true,
  barrel: true,
  crate_stack: true,
  puddle: true,
  parked_car: true,
  trunk: true,
  pole: true,
  gate_post: true,
  pickup: true,
  hatchback: true,
  suv: true,
  bin: true,
  hydrant: true,
  planter: true,
  sidewalk: true,
  crosswalk: true,
  dashed_line: true,
  parking_mark: true,
  road_arrow: true,
};
const SURFACES: Record<Surface, true> = {
  asphalt: true,
  concrete: true,
  grass: true,
  snow: true,
  ice: true,
  rubber: true,
  wood: true,
  metal: true,
  plastic: true,
  sand: true,
  dirt: true,
  fabric: true,
  stone: true,
  glass: true,
};
const FINISHES: Record<Finish, true> = {
  plain: true,
  brick: true,
  concrete: true,
  asphalt: true,
  wood: true,
  tiles: true,
  painted_metal: true,
  glass: true,
  grass: true,
  fabric: true,
  rubber: true,
  blocks: true,
};

const isStyle = (value: string): value is Style => Object.hasOwn(STYLES, value);
const isSurface = (value: string): value is Surface => Object.hasOwn(SURFACES, value);
const isFinish = (value: string): value is Finish => Object.hasOwn(FINISHES, value);

const material = (components: readonly ComponentSpec[], name: string) =>
  components.find((component) => component.kind === "material")?.properties[name];

function textOf(components: readonly ComponentSpec[], name: string): string {
  const value = material(components, name);
  return value?.type === "list" || value?.type === "choice" ? value.value : "";
}

function numberOf(components: readonly ComponentSpec[], name: string): number | undefined {
  const value = material(components, name);
  return value?.type === "slider" || value?.type === "number" ? value.value : undefined;
}

// How a piece's material draws it, as the engine exports a placed piece: style, surface, finish and glow.
export function pieceLook(components: readonly ComponentSpec[]): Partial<SceneGeom> {
  const style = textOf(components, "style");
  const surface = textOf(components, "surface");
  const finish = textOf(components, "finish");
  return {
    ...(isStyle(style) && style !== "plain" ? { style } : {}),
    ...(isSurface(surface) ? { surface } : {}),
    ...(isFinish(finish) && finish !== "plain" ? { finish } : {}),
    roughness: numberOf(components, "roughness") ?? 0.5,
    metalness: numberOf(components, "metalness") ?? 0.5,
    emissive: numberOf(components, "emissive") ?? 0,
    reflectance: numberOf(components, "reflectance") ?? 0,
    bevel: numberOf(components, "bevel") ?? 0,
  };
}
