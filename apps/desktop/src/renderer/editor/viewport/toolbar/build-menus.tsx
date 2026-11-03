// PNL-TOOLBAR · POP-INSERT-PART, POP-SNAP, POP-GRID
import { Box, Grid3x3, Magnet } from "lucide-react";
import { useEffect } from "react";
import { PART_KINDS } from "../../../ports/part-insert.ts";
import { MenuButton, type MenuEntry } from "../../../ui/menu.tsx";
import { useBuildSettings } from "../build-settings.ts";
import { usePickPart } from "../insert-part.ts";
import { GRID_CELLS, MOVE_STEPS, ROTATE_STEPS, stepLabel } from "../snapping.ts";
import { toolClass } from "./toolbar.tsx";

const GRID_MODES = [
  { mode: "auto", label: "Grid: automatic", hint: "Shown while no ground slab already shows the floor" },
  { mode: "on", label: "Grid: always", hint: "Shown over the ground too" },
  { mode: "off", label: "Grid: hidden", hint: "Never shown" },
] as const;

// The World toolbar's building menus: insert a part, the move and turn snaps, and the helper grid. The snaps and the
// grid are remembered on this computer.
export function BuildMenus({ scene }: { scene: string }) {
  const settings = useBuildSettings();
  const pick = usePickPart(scene);
  const { placing, setPlacing } = settings;
  useEffect(() => {
    if (!placing) {
      return;
    }
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlacing(null);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [placing, setPlacing]);
  const parts: MenuEntry[] = [
    ...PART_KINDS.map((kind) => ({
      label: kind.label,
      hint: settings.placeOnClick ? "Click in the view where it goes" : "Added at the middle of the view",
      run: () => pick(kind.shape),
    })),
    { divider: true, key: "place" },
    {
      label: "Place where I click",
      hint: "Choose a part, then click the ground or another part",
      checked: settings.placeOnClick,
      run: () => settings.change({ placeOnClick: !settings.placeOnClick }),
    },
    ...(placing ? [{ label: "Cancel placing", hint: "Esc also cancels", run: () => setPlacing(null) }] : []),
  ];
  const snaps: MenuEntry[] = [
    ...MOVE_STEPS.map((step) => ({
      label: `Move ${stepLabel(step, "m").toLowerCase()}`,
      hint: step === null ? "Drag freely" : "Moves and stretches land on this step",
      checked: settings.move === step,
      run: () => settings.change({ move: step }),
    })),
    { divider: true, key: "rotate" },
    ...ROTATE_STEPS.map((step) => ({
      label: `Rotate ${stepLabel(step, "°").toLowerCase()}`,
      hint: step === null ? "Turn freely" : "Turns go in steps of this angle",
      checked: settings.rotate === step,
      run: () => settings.change({ rotate: step }),
    })),
  ];
  const grid: MenuEntry[] = [
    ...GRID_MODES.map(({ mode, label, hint }) => ({
      label,
      hint,
      checked: settings.grid === mode,
      run: () => settings.change({ grid: mode }),
    })),
    { divider: true, key: "cell" },
    ...GRID_CELLS.map((cell) => ({
      label: `Cells of ${cell} m`,
      checked: settings.cell === cell,
      run: () => settings.change({ cell }),
    })),
  ];
  return (
    <>
      <MenuButton label="Part" entries={parts} align="start" className={toolClass(placing !== null)}>
        <Box size={18} strokeWidth={1.75} aria-hidden />
        <span className="text-micro">{placing ? "Placing…" : "Part"}</span>
      </MenuButton>
      <MenuButton label="Snap" entries={snaps} align="start" className={toolClass(false)}>
        <Magnet size={18} strokeWidth={1.75} aria-hidden />
        <span className="text-micro">
          {settings.move === null && settings.rotate === null
            ? "Snap off"
            : snapSummary(settings.move, settings.rotate)}
        </span>
      </MenuButton>
      <MenuButton label="Grid" entries={grid} align="start" className={toolClass(false)}>
        <Grid3x3 size={18} strokeWidth={1.75} aria-hidden />
        <span className="text-micro">{settings.grid === "off" ? "Grid off" : `Grid ${settings.cell} m`}</span>
      </MenuButton>
    </>
  );
}

function snapSummary(move: number | null, rotate: number | null): string {
  return `${move === null ? "free" : `${move} m`} · ${rotate === null ? "free" : `${rotate}°`}`;
}
