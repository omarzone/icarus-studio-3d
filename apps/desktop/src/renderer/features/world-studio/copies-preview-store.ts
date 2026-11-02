import { create } from "zustand";

// Which project's World viewport shows its training copies instead of the editable scene; view state only.
type CopiesPreviewState = {
  scene: string | null;
  show: (scene: string) => void;
  hide: () => void;
};

export const useCopiesPreview = create<CopiesPreviewState>()((set) => ({
  scene: null,
  show: (scene) => set({ scene }),
  hide: () => set({ scene: null }),
}));
