import { create } from "zustand";
import { GRID_CELLS, type GridMode, MOVE_STEPS, type MoveStep, ROTATE_STEPS, type RotateStep } from "./snapping.ts";

// How building in the World view behaves on this computer: snapping, the helper grid and where parts are inserted.
// View preferences only; every edit still goes to the engine as operations.
export type BuildSettings = {
  move: MoveStep;
  rotate: RotateStep;
  grid: GridMode;
  cell: number;
  // Insert parts where the next click lands instead of at the middle of the view.
  placeOnClick: boolean;
};

const KEY = "icarus.build-settings";
export const DEFAULT_BUILD_SETTINGS: BuildSettings = {
  move: 0.5,
  rotate: 15,
  grid: "auto",
  cell: 1,
  placeOnClick: false,
};

// Keeps only values the menus offer, so an old or edited entry never reaches the gizmo.
export function readBuildSettings(raw: string | null): BuildSettings {
  if (!raw) {
    return DEFAULT_BUILD_SETTINGS;
  }
  try {
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== "object" || saved === null) {
      return DEFAULT_BUILD_SETTINGS;
    }
    const field = (name: string): unknown => (name in saved ? Reflect.get(saved, name) : undefined);
    const move = MOVE_STEPS.find((step) => step === field("move"));
    const rotate = ROTATE_STEPS.find((step) => step === field("rotate"));
    const grid = (["auto", "on", "off"] as const).find((mode) => mode === field("grid"));
    const cell = GRID_CELLS.find((size) => size === field("cell"));
    const place = field("placeOnClick");
    return {
      move: move === undefined ? DEFAULT_BUILD_SETTINGS.move : move,
      rotate: rotate === undefined ? DEFAULT_BUILD_SETTINGS.rotate : rotate,
      grid: grid ?? DEFAULT_BUILD_SETTINGS.grid,
      cell: cell ?? DEFAULT_BUILD_SETTINGS.cell,
      placeOnClick: typeof place === "boolean" ? place : DEFAULT_BUILD_SETTINGS.placeOnClick,
    };
  } catch {
    return DEFAULT_BUILD_SETTINGS;
  }
}

function load(): BuildSettings {
  try {
    return readBuildSettings(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_BUILD_SETTINGS;
  }
}

function save(settings: BuildSettings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable; the settings still apply until the app closes.
  }
}

type BuildState = BuildSettings & {
  change: (patch: Partial<BuildSettings>) => void;
  // A part shape waiting for the click that places it, while Place on click is on.
  placing: string | null;
  setPlacing: (shape: string | null) => void;
};

export const useBuildSettings = create<BuildState>()((set, get) => ({
  ...load(),
  change: (patch) => {
    set(patch);
    const { move, rotate, grid, cell, placeOnClick } = get();
    save({ move, rotate, grid, cell, placeOnClick });
  },
  placing: null,
  setPlacing: (placing) => set({ placing }),
}));
