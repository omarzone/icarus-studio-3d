import { createContext, useContext } from "react";
import { create } from "zustand";

// Set when a panel is drawn inside a dock tab instead of a fixed column.
export type DockedPanel = { id: string };

export const DockedPanelContext = createContext<DockedPanel | null>(null);

export function useDockedPanel(): DockedPanel | null {
  return useContext(DockedPanelContext);
}

// A docked panel draws its tabs next to the dock tab's grip and its options at the right of the group's tab bar.
export type DockSlot = "tabs" | "options";

type Slots = {
  slots: Readonly<Record<string, HTMLElement>>;
  setSlot: (slot: DockSlot, panel: string, element: HTMLElement | null) => void;
};

export const useDockSlots = create<Slots>((set) => ({
  slots: {},
  setSlot: (slot, panel, element) =>
    set((state) => {
      const key = `${slot}:${panel}`;
      if (element ? state.slots[key] === element : !(key in state.slots)) {
        return state;
      }
      const { [key]: _removed, ...rest } = state.slots;
      return { slots: element ? { ...rest, [key]: element } : rest };
    }),
}));

export function useDockSlot(slot: DockSlot, panel: string): HTMLElement | undefined {
  return useDockSlots((state) => state.slots[`${slot}:${panel}`]);
}
