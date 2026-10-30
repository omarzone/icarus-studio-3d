import { create } from "zustand";

export type Notice = { id: number; title: string; detail?: string };

type NoticesState = {
  notices: Notice[];
  notify: (notice: Omit<Notice, "id">) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useNotices = create<NoticesState>()((set) => ({
  notices: [],
  notify: (notice) => set((state) => ({ notices: [...state.notices.slice(-2), { ...notice, id: nextId++ }] })),
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) })),
}));
