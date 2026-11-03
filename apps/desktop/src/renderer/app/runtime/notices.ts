import { create } from "zustand";

export type Notice = { id: number; title: string; detail?: string };

type NoticesState = {
  notices: Notice[];
  notify: (notice: Omit<Notice, "id">) => void;
  dismiss: (id: number) => void;
};

// Notices float over the bottom of the workspace, so they leave by themselves instead of covering its controls.
export const NOTICE_MS = 8000;

let nextId = 1;

export const useNotices = create<NoticesState>()((set, get) => ({
  notices: [],
  notify: (notice) => {
    const id = nextId++;
    // The same notice again replaces the old one instead of stacking a copy.
    set((state) => ({
      notices: [...state.notices.filter((shown) => shown.title !== notice.title).slice(-2), { ...notice, id }],
    }));
    setTimeout(() => get().dismiss(id), NOTICE_MS);
  },
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) })),
}));
