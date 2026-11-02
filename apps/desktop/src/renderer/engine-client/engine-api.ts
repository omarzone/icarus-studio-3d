import type {
  EditOperation,
  LibraryCatalog,
  ProjectState,
  ProjectSummary,
  Revision,
  SceneDescription,
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

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});

const at = (id: string) => `/projects/${encodeURIComponent(id)}`;

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
};

export type EngineApi = typeof engineApi;
