import { ChevronDown, Scan } from "lucide-react";
import { CAMERA_MODES, type CameraMode } from "../../scene/camera-mode.ts";
import { MenuButton, type MenuEntry } from "../../ui/menu.tsx";

type Props = { mode: CameraMode; onMode: (mode: CameraMode) => void; onFrameAll: () => void };

// The view option that picks how the camera moves, with Frame all; it looks like the other view options.
export function CameraMenu({ mode, onMode, onFrameAll }: Props) {
  const entries: MenuEntry[] = [
    ...CAMERA_MODES.map((item) => ({
      label: item.label,
      hint: item.hint,
      checked: item.mode === mode,
      run: () => onMode(item.mode),
    })),
    { divider: true, key: "frame" },
    { label: "Frame all", hint: "Press F in the view", icon: Scan, run: onFrameAll },
  ];
  const current = CAMERA_MODES.find((item) => item.mode === mode)?.label ?? "Free";
  return (
    <MenuButton
      label="Camera"
      entries={entries}
      className="inline-flex items-center gap-1 rounded-control bg-control px-2 py-0.75 text-ui text-fg-tertiary hover:bg-control-raised hover:text-fg active:opacity-80"
    >
      {current}
      <ChevronDown size={10} strokeWidth={2} aria-hidden />
    </MenuButton>
  );
}
