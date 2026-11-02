import type { AgentStep, EngineEvent } from "@icarus/contracts";
import { createStore, useStore } from "zustand";
import { nextLiveSteps } from "./engine-event-effects.ts";

// The steps of the copilot turn running right now in each project, filled by the project's event stream.
type LiveTurns = { steps: Readonly<Record<string, readonly AgentStep[]>> };

const NONE: readonly AgentStep[] = [];

const liveTurns = createStore<LiveTurns>(() => ({ steps: {} }));

export function applyLiveTurnEvent(project: string, event: EngineEvent): void {
  const current = liveTurns.getState().steps[project] ?? NONE;
  const next = nextLiveSteps(current, event);
  if (next !== current) {
    liveTurns.setState((state) => ({ steps: { ...state.steps, [project]: next } }));
  }
}

export function clearLiveTurn(project: string): void {
  liveTurns.setState((state) => ({ steps: { ...state.steps, [project]: NONE } }));
}

export function useLiveSteps(project: string | undefined): readonly AgentStep[] {
  return useStore(liveTurns, (state) => (project ? (state.steps[project] ?? NONE) : NONE));
}
