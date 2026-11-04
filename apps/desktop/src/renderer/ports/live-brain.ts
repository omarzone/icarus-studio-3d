import type { PlayBrainActivity, PlayReading } from "@icarus/contracts";

// What the trained brain playing a project computes right now, as the Play stream last reported it. The Play port
// writes it while a session runs; the brain port reads it so its views follow Play instead of the evaluation.

export type LiveBrain = {
  runId: string;
  step: number;
  // Which brain plays, in words.
  brain: string;
  activity: PlayBrainActivity;
  senses: readonly PlayReading[];
  actions: readonly PlayReading[];
};

type Listener = () => void;

export type LiveBrains = {
  current: (project: string) => LiveBrain | null;
  publish: (project: string, live: LiveBrain) => void;
  clear: (project: string) => void;
  // Calls back whenever the project's live brain changes or stops; the returned function stops listening.
  subscribe: (project: string, listener: Listener) => () => void;
};

export function createLiveBrains(): LiveBrains {
  const latest = new Map<string, LiveBrain>();
  const listeners = new Map<string, Set<Listener>>();
  const notify = (project: string) => {
    for (const listener of listeners.get(project) ?? []) {
      listener();
    }
  };
  return {
    current: (project) => latest.get(project) ?? null,
    publish: (project, live) => {
      latest.set(project, live);
      notify(project);
    },
    clear: (project) => {
      if (latest.delete(project)) {
        notify(project);
      }
    },
    subscribe: (project, listener) => {
      const set = listeners.get(project) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(project, set);
      return () => {
        set.delete(listener);
      };
    },
  };
}

export const liveBrains: LiveBrains = createLiveBrains();
