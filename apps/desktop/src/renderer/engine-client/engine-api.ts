import type {
  BuildIdea,
  BuildStatus,
  CheckpointInfo,
  ContextRequest,
  ContextUsage,
  Conversation,
  EditOperation,
  IdeaSet,
  LibraryCatalog,
  MetricPoint,
  MixIdeas,
  ModelSettings,
  ModelSettingsPatch,
  ProjectActivity,
  ProjectClosed,
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
  TweakIdea,
  UnpackBundle,
} from "@icarus/contracts";
import { isContextUsage } from "./context-usage-checks.ts";
import { isBuildStatus, isConversation, isIdeaSet, isModelSettings } from "./copilot-checks.ts";
import { isProjectActivity, isProjectClosed } from "./project-activity-checks.ts";
import { request } from "./request.ts";
import {
  isLibraryCatalog,
  isNothing,
  isProjectState,
  isProjectSummaries,
  isRevisions,
  isSceneDescription,
  isSceneDescriptions,
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
  vaultBodyScene: (bodyId: string): Promise<SceneDescription> =>
    request(`/library/bodies/${encodeURIComponent(bodyId)}/scene`, {}, isSceneDescription),
  listProjects: (): Promise<ProjectSummary[]> => request("/projects", {}, isProjectSummaries),
  createProject: (name: string, template: string): Promise<ProjectState> =>
    request("/projects", post({ name, template }), isProjectState),
  project: (id: string): Promise<ProjectState> => request(at(id), {}, isProjectState),
  deleteProject: (id: string): Promise<undefined> => request(at(id), { method: "DELETE" }, isNothing),
  projectActivity: (id: string): Promise<ProjectActivity> => request(`${at(id)}/activity`, {}, isProjectActivity),
  // Stops what the project still runs and waits for it to end; a run that ignores its stop is killed after 60 s.
  closeProject: (id: string): Promise<ProjectClosed> => request(`${at(id)}/close`, post(), isProjectClosed),
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
  // A community bundle becomes a new project; the engine checks it is data, in a known version, and passes its tests.
  unpackBundle: (body: UnpackBundle): Promise<ProjectState> => request("/bundles/unpack", post(body), isProjectState),
  startRun: (id: string, body: StartRun): Promise<RunStatus> => request(`${at(id)}/runs`, post(body), isRunStatus),
  runs: (id: string): Promise<RunStatus[]> => request(`${at(id)}/runs`, {}, isRunStatuses),
  run: (runId: string): Promise<RunStatus> => request(run(runId), {}, isRunStatus),
  stopRun: (runId: string): Promise<RunStatus> => request(`${run(runId)}/stop`, post(), isRunStatus),
  pauseRun: (runId: string): Promise<RunStatus> => request(`${run(runId)}/pause`, post(), isRunStatus),
  resumeRun: (runId: string): Promise<RunStatus> => request(`${run(runId)}/resume`, post(), isRunStatus),
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
  // What the next message would send to the model, measured piece by piece; nothing is sent.
  contextUsage: (id: string, body: ContextRequest): Promise<ContextUsage> =>
    request(`${at(id)}/conversation/context`, post(body), isContextUsage),
  setAutonomy: (id: string, body: SetAutonomy): Promise<Conversation> =>
    request(`${at(id)}/conversation/autonomy`, post(body), isConversation),
  applyProposal: (id: string): Promise<Conversation> => request(`${proposal(id)}/apply`, post(), isConversation),
  discardProposal: (id: string): Promise<Conversation> => request(`${proposal(id)}/discard`, post(), isConversation),
  proposalScene: (id: string): Promise<SceneDescription> => request(`${proposal(id)}/scene`, {}, isSceneDescription),
  createIdeas: (prompt: string): Promise<IdeaSet> => request("/ideas", post({ prompt }), isIdeaSet),
  ideas: (id: string): Promise<IdeaSet> => request(`/ideas/${encodeURIComponent(id)}`, {}, isIdeaSet),
  startBuild: (body: BuildIdea): Promise<BuildStatus> => request("/builds", post(body), isBuildStatus),
  tweakIdea: (set: string, idea: string, body: TweakIdea): Promise<IdeaSet> =>
    request(`/ideas/${encodeURIComponent(set)}/ideas/${encodeURIComponent(idea)}/tweak`, post(body), isIdeaSet),
  mixIdeas: (set: string, body: MixIdeas): Promise<BuildStatus> =>
    request(`/ideas/${encodeURIComponent(set)}/mix`, post(body), isBuildStatus),
  build: (id: string): Promise<BuildStatus> => request(`/builds/${encodeURIComponent(id)}`, {}, isBuildStatus),
  modelSettings: (): Promise<ModelSettings> => request("/settings/models", {}, isModelSettings),
  saveModelSettings: (patch: ModelSettingsPatch): Promise<ModelSettings> =>
    request("/settings/models", put(patch), isModelSettings),
  testModelSettings: (): Promise<ModelSettings> => request("/settings/models/test", post(), isModelSettings),
};

export type EngineApi = typeof engineApi;

// Training copies (POP-TRAINING-COPIES): copy i's first episode as training starts it (seed = brain seed + i);
// without a count, as many as the brain trains (up to the engine's preview limit).
export const copiesApi = {
  copyScenes: (id: string, count?: number): Promise<SceneDescription[]> =>
    request(`${at(id)}/copies${count === undefined ? "" : `?count=${count}`}`, {}, isSceneDescriptions),
};

export type CopiesApi = typeof copiesApi;
