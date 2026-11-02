// POP-EXPLORER-OBJECT
import { Copy, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useRef } from "react";
import { useAnchoredStyle } from "../../ui/anchored.ts";
import { useDismiss } from "../../ui/dismiss.ts";
import { type MenuEntry, MenuSurface } from "../../ui/menu.tsx";

export type ObjectMenuActions = {
  rename: () => void;
  duplicate: () => void;
  remove: () => void;
  ask: () => void;
};

type Props = {
  // The row that was right-clicked; the menu opens under it.
  row: HTMLElement;
  name: string;
  actions: ObjectMenuActions;
  onClose: () => void;
};

// Right-click menu of an Explorer row: rename, duplicate, delete, or ask the copilot about the object.
export function ObjectMenu({ row, name, actions, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const anchor = useMemo(() => ({ current: row }), [row]);
  const inside = useMemo(() => [menu], []);
  useDismiss(true, inside, onClose);
  const placement = useAnchoredStyle(true, anchor, menu, "start");
  const entries: MenuEntry[] = [
    { label: "Rename", hint: "Give it a new name (F2)", icon: Pencil, run: actions.rename },
    { label: "Duplicate", hint: "Copy it and what is inside it", icon: Copy, run: actions.duplicate },
    { label: "Delete", hint: "Remove it and what is inside it (Del)", icon: Trash2, run: actions.remove },
    { divider: true, key: "copilot" },
    { label: "Ask the copilot about it", hint: "What it does and how to improve it", icon: Sparkles, run: actions.ask },
  ];
  return (
    <MenuSurface
      ref={menu}
      label={`${name} actions`}
      entries={entries}
      style={{ ...placement, minWidth: undefined }}
      onPick={onClose}
      body={row.ownerDocument.body}
    />
  );
}
