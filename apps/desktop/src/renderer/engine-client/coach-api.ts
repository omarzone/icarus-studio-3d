import type { AutopilotStart, AutopilotStatus, Diagnosis, FailureGroup } from "@icarus/contracts";
import { isAutopilotStatus, isDiagnoses, isDiagnosis, isFailureGroups } from "./coach-checks.ts";
import { EngineError, request } from "./request.ts";

// The coach on the engine: diagnoses of runs, failure groups of a checkpoint and the project's autopilot.

const run = (id: string) => `/runs/${encodeURIComponent(id)}`;
const autopilot = (id: string) => `/projects/${encodeURIComponent(id)}/autopilot`;

export const coachApi = {
  diagnose: (runId: string): Promise<Diagnosis> => request(`${run(runId)}/diagnosis`, { method: "POST" }, isDiagnosis),
  diagnoses: (runId: string): Promise<Diagnosis[]> => request(`${run(runId)}/diagnoses`, {}, isDiagnoses),
  checkpointFailures: (runId: string, step: number): Promise<FailureGroup[]> =>
    request(`${run(runId)}/checkpoints/${step}/failures`, {}, isFailureGroups),
  startAutopilot: (projectId: string, body: AutopilotStart): Promise<AutopilotStatus> =>
    request(autopilot(projectId), { method: "POST", body: JSON.stringify(body) }, isAutopilotStatus),
  // Null when the autopilot never ran for this project.
  autopilot: async (projectId: string): Promise<AutopilotStatus | null> => {
    try {
      return await request(autopilot(projectId), {}, isAutopilotStatus);
    } catch (error) {
      if (error instanceof EngineError && error.code === "not_found") {
        return null;
      }
      throw error;
    }
  },
  stopAutopilot: (projectId: string): Promise<AutopilotStatus> =>
    request(autopilot(projectId), { method: "DELETE" }, isAutopilotStatus),
};

export type CoachApi = typeof coachApi;
