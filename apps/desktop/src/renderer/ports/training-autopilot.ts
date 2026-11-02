import { type CoachApi, coachApi } from "../engine-client/coach-api.ts";
import {
  type AutopilotChoice,
  autopilotSettings,
  autopilotStart,
  DEFAULT_AUTOPILOT,
  limitsWith,
} from "./coach-views.ts";
import type { TrainingPort } from "./training-port.ts";

// The autopilot on the engine: the person's choice of mode and limits stays in the app until it starts.

type AutopilotApi = Pick<CoachApi, "autopilot" | "startAutopilot" | "stopAutopilot">;

export type EngineAutopilot = Pick<TrainingPort, "getAutopilot" | "setAutopilot" | "startAutopilot" | "stopAutopilot">;

export function createEngineAutopilot(api: AutopilotApi = coachApi): EngineAutopilot {
  const choices = new Map<string, AutopilotChoice>();
  const choiceOf = (project: string) => choices.get(project) ?? DEFAULT_AUTOPILOT;
  const read = async (project: string) => autopilotSettings(await api.autopilot(project), choiceOf(project));
  return {
    getAutopilot: read,
    setAutopilot: async ({ project, mode, limits }) => {
      const current = await read(project);
      if (current.progress?.active) {
        if (mode === "off") {
          choices.set(project, { ...choiceOf(project), mode });
          return autopilotSettings(await api.stopAutopilot(project), choiceOf(project));
        }
        if (mode !== undefined && mode !== current.mode) {
          throw new Error("Stop the autopilot to change how it works");
        }
        return current;
      }
      const choice = choiceOf(project);
      choices.set(project, { mode: mode ?? choice.mode, limits: limitsWith(choice.limits, limits ?? {}) });
      return read(project);
    },
    startAutopilot: async (project) =>
      autopilotSettings(await api.startAutopilot(project, autopilotStart(choiceOf(project))), choiceOf(project)),
    stopAutopilot: async (project) => autopilotSettings(await api.stopAutopilot(project), choiceOf(project)),
  };
}
