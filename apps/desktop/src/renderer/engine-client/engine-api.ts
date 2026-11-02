import type {
  CheckpointInfo,
  EditOperation,
  LibraryCatalog,
  MetricPoint,
  ProjectState,
  ProjectSummary,
  Revision,
  Rollout,
  RunStatus,
  SceneDescription,
  StartRun,
  TrainingSettings,
  TrainingSettingsPatch,
} from "@icarus/contracts";
import { request } from "./request.ts";
import {
  isLibraryCatalog,
  isNothing,
  isProjectState,
  isProjectSummaries,
  isRevisions,
  isSceneDescription,
} from "./response-checks.ts";
import {
  isCheckpoints,
  isMetricPoints,
  isRollout,
  isRunStatus,
  isRunStatuses,
  isTrainingSettings,
} from "./training-checks.ts";

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});

const at = (id: string) => `/projects/${encodeURIComponent(id)}`;
const run = (id: string) => `/runs/${encodeURIComponent(id)}`;

// One function per engine route the desktop uses.
export const engineApi = {
  library: (): Promise<LibraryCatalog> => request("/library", {}, isLibraryCatalog),
  listProjects: (): Promise<ProjectSummary[]> => request("/projects", {}, isProjectSummaries),
  createProject: (name: string, template: string): Promise<ProjectState> =>
    request("/projects", post({ name, template }), isProjectState),
  project: (id: string): Promise<ProjectState> => request(at(id), {}, isProjectState),
  deleteProject: (id: string): Promise<undefined> => request(at(id), { method: "DELETE" }, isNothing),
  applyOperations: (id: string, operations: EditOperation[], summary: string): Promise<ProjectState> =>
    request(`${at(id)}/operations`, post({ operations, summary }), isProjectState),
  revisions: (id: string): Promise<Revision[]> => request(`${at(id)}/revisions`, {}, isRevisions),
  undo: (id: string): Promise<ProjectState> => request(`${at(id)}/undo`, post(), isProjectState),
  redo: (id: string): Promise<ProjectState> => request(`${at(id)}/redo`, post(), isProjectState),
  scene: (id: string): Promise<SceneDescription> => request(`${at(id)}/scene`, {}, isSceneDescription),
  duplicateProject: (id: string, name: string): Promise<ProjectState> =>
    request(`${at(id)}/duplicate`, post({ name }), isProjectState),
  restoreRevision: (id: string, revision: number): Promise<ProjectState> =>
    request(`${at(id)}/revisions/${revision}/restore`, post(), isProjectState),
  startRun: (id: string, body: StartRun): Promise<RunStatus> => request(`${at(id)}/runs`, post(body), isRunStatus),
  runs: (id: string): Promise<RunStatus[]> => request(`${at(id)}/runs`, {}, isRunStatuses),
  run: (runId: string): Promise<RunStatus> => request(run(runId), {}, isRunStatus),
  stopRun: (runId: string): Promise<RunStatus> => request(`${run(runId)}/stop`, post(), isRunStatus),
  metrics: (runId: string): Promise<MetricPoint[]> => request(`${run(runId)}/metrics`, {}, isMetricPoints),
  checkpoints: (runId: string): Promise<CheckpointInfo[]> => request(`${run(runId)}/checkpoints`, {}, isCheckpoints),
  runScene: (runId: string): Promise<SceneDescription> => request(`${run(runId)}/scene`, {}, isSceneDescription),
  rollout: (runId: string, step: number): Promise<Rollout> => request(`${run(runId)}/rollouts/${step}`, {}, isRollout),
  trainingSettings: (): Promise<TrainingSettings> => request("/settings/training", {}, isTrainingSettings),
  saveTrainingSettings: (patch: TrainingSettingsPatch): Promise<TrainingSettings> =>
    request("/settings/training", { method: "PUT", body: JSON.stringify(patch) }, isTrainingSettings),
};

export type EngineApi = typeof engineApi;
