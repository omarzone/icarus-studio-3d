import type {
  BuildIdea,
  BuildStatus,
  CheckpointInfo,
  Conversation,
  EditOperation,
  IdeaSet,
  LibraryCatalog,
  MetricPoint,
  ModelSettings,
  ModelSettingsPatch,
  ProjectState,
  ProjectSummary,
  Revision,
  Rollout,
  RunStatus,
  SceneDescription,
  SendMessage,
  SetAutonomy,
  StartRun,
  TrainingSettings,
  TrainingSettingsPatch,
} from "@icarus/contracts";
import { isBuildStatus, isConversation, isIdeaSet, isModelSettings } from "./copilot-checks.ts";
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
const proposal = (id: string) => `/proposals/${encodeURIComponent(id)}`;
const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });

// One function per engine route the desktop uses.
export const engineApi = {
  library: (): Promise<LibraryCatalog> => request("/library", {}, isLibraryCatalog),
  templateScene: (templateId: string): Promise<SceneDescription> =>
    request(`/library/templates/${encodeURIComponent(templateId)}/scene`, {}, isSceneDescription),
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
    request("/settings/training", put(patch), isTrainingSettings),
  conversation: (id: string): Promise<Conversation> => request(`${at(id)}/conversation`, {}, isConversation),
  sendMessage: (id: string, body: SendMessage): Promise<Conversation> =>
    request(`${at(id)}/conversation/messages`, post(body), isConversation),
  setAutonomy: (id: string, body: SetAutonomy): Promise<Conversation> =>
    request(`${at(id)}/conversation/autonomy`, post(body), isConversation),
  applyProposal: (id: string): Promise<Conversation> => request(`${proposal(id)}/apply`, post(), isConversation),
  discardProposal: (id: string): Promise<Conversation> => request(`${proposal(id)}/discard`, post(), isConversation),
  proposalScene: (id: string): Promise<SceneDescription> => request(`${proposal(id)}/scene`, {}, isSceneDescription),
  createIdeas: (prompt: string): Promise<IdeaSet> => request("/ideas", post({ prompt }), isIdeaSet),
  ideas: (id: string): Promise<IdeaSet> => request(`/ideas/${encodeURIComponent(id)}`, {}, isIdeaSet),
  startBuild: (body: BuildIdea): Promise<BuildStatus> => request("/builds", post(body), isBuildStatus),
  build: (id: string): Promise<BuildStatus> => request(`/builds/${encodeURIComponent(id)}`, {}, isBuildStatus),
  modelSettings: (): Promise<ModelSettings> => request("/settings/models", {}, isModelSettings),
  saveModelSettings: (patch: ModelSettingsPatch): Promise<ModelSettings> =>
    request("/settings/models", put(patch), isModelSettings),
  testModelSettings: (): Promise<ModelSettings> => request("/settings/models/test", post(), isModelSettings),
};

export type EngineApi = typeof engineApi;
