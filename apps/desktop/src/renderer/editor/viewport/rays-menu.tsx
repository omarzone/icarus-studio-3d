import { ChevronDown } from "lucide-react";
import type { RayView } from "../../scene/ray-lines.ts";
import { MenuButton, type MenuEntry } from "../../ui/menu.tsx";

type Props = { view: RayView; onView: (view: RayView) => void; copies: boolean };

// The view option that shows or hides the distance sensors; `copies` offers every training copy's rays.
export function RaysMenu({ view, onView, copies }: Props) {
  const entries: MenuEntry[] = [
    {
      label: "Show rays",
      hint: "Where each distance sensor looks",
      checked: view.shown,
      run: () => onView({ ...view, shown: !view.shown }),
    },
    {
      label: "Show distances",
      hint: "What each ray reads where it hits",
      checked: view.values,
      run: () => onView({ ...view, values: !view.values }),
    },
    ...(copies
      ? [
          {
            label: "All copies",
            hint: "Every copy's rays, not only the followed one",
            checked: view.allCopies,
            run: () => onView({ ...view, allCopies: !view.allCopies }),
          },
        ]
      : []),
  ];
  return (
    <MenuButton
      label="Rays"
      entries={entries}
      className={`inline-flex items-center gap-1 rounded-control bg-control px-2 py-0.75 text-ui hover:bg-control-raised hover:text-fg active:opacity-80 ${view.shown ? "text-fg" : "text-fg-tertiary"}`}
    >
      Rays
      <ChevronDown size={10} strokeWidth={2} aria-hidden />
    </MenuButton>
  );
}
