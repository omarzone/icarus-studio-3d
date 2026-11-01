import { create } from "zustand";

// A message another control asks the copilot chat to send for the user (the guide's "Ask the copilot…").
// The open chat of that conversation takes it and sends it through its own send path.
export type OutgoingMessage = { id: number; conversation: string; text: string };

type OutboxState = {
  waiting: OutgoingMessage | null;
  ask: (conversation: string, text: string) => void;
  take: (id: number) => void;
};

let nextId = 1;

export const useCopilotOutbox = create<OutboxState>()((set) => ({
  waiting: null,
  ask: (conversation, text) => set({ waiting: { id: nextId++, conversation, text } }),
  take: (id) => set((state) => (state.waiting?.id === id ? { waiting: null } : state)),
}));
