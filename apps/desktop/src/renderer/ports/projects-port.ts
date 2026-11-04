import type { SceneDescription } from "@icarus/contracts";
import type { ScreenId } from "../app/navigation/catalog-id.ts";
import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { projectFootprint, projectView, withRuns, workView } from "./project-views.ts";
import { createProjectsFixture } from "./projects.fixture.ts";

// View types the screens need; the engine implementation maps @icarus/contracts types onto them.
export type ProjectStatus = "draft" | "training" | "published" | "attention" | "tested";

export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  // Short status line under the name ("Training · run 3 at 31%").
  statusLine: string;
  revision: string;
  // Workspace the project reopens in; the World workspace when absent.
  lastScreen?: ScreenId;
  // Community votes once published.
  votes?: number;
  // When the newest revision was saved (ISO time); absent in sample data.
  updatedAt?: string;
};

// What a project keeps on this computer, for the duplicate and delete dialogs.
export type ProjectFootprint = {
  trainingRuns: number;
  // Size of the training runs and timelapses in bytes; null when it is not measured.
  runsBytes: number | null;
  // Deleting the project deletes its runs and duplicating can copy them; when false they stay where they are.
  runsFollowProject: boolean;
};

// Something the project still runs in the engine; closing the project stops it.
export type ProjectWork = {
  kind: "training" | "autopilot" | "task";
  id: string;
  title: string;
  progress: number | null;
};

// What closing stopped, and what was asked to stop but was still ending when closing stopped waiting.
export type ProjectClosing = { stopped: ProjectWork[]; stillRunning: ProjectWork[] };

export type ProjectsPort = {
  listProjects: () => Promise<ProjectSummary[]>;
  getProject: (id: string) => Promise<ProjectSummary>;
  renameProject: (input: { id: string; name: string; description: string }) => Promise<ProjectSummary>;
  duplicateProject: (input: { id: string; name: string; include: readonly string[] }) => Promise<ProjectSummary>;
  deleteProject: (id: string) => Promise<void>;
  projectActivity: (id: string) => Promise<ProjectWork[]>;
  closeProject: (id: string) => Promise<ProjectClosing>;
  getFootprint: (id: string) => Promise<ProjectFootprint>;
  createProject: (input: { template: string; name: string }) => Promise<ProjectSummary>;
  // The compiled scene of the current revision; null where there is none (sample data).
  projectScene: ((id: string) => Promise<SceneDescription>) | null;
};

export const projectsPort = definePort<ProjectsPort>({
  app: {
    // One runs request per project, in parallel; a project whose runs cannot be read still lists as it is.
    listProjects: async () => {
      const projects = (await engineApi.listProjects()).map(projectView);
      const runs = await Promise.all(projects.map((project) => engineApi.runs(project.id).catch(() => [])));
      return projects.map((project, index) => withRuns(project, runs[index] ?? []));
    },
    getProject: async (id) => {
      const state = await engineApi.project(id);
      return projectView({ ...state.project, revision: state.revision.number });
    },
    renameProject: async ({ id, name, description }) => {
      const state = await engineApi.applyOperations(
        id,
        [{ op: "rename_project", name, description }],
        `Renamed to ${name}`,
      );
      return projectView({ ...state.project, revision: state.revision.number });
    },
    // The engine copies the design only; runs and their brains stay with the original.
    duplicateProject: async ({ id, name }) => {
      const state = await engineApi.duplicateProject(id, name);
      return projectView({ ...state.project, revision: state.revision.number });
    },
    deleteProject: async (id) => {
      await engineApi.deleteProject(id);
    },
    projectActivity: async (id) => (await engineApi.projectActivity(id)).running.map(workView),
    closeProject: async (id) => {
      const closed = await engineApi.closeProject(id);
      return { stopped: closed.stopped.map(workView), stillRunning: closed.still_running.map(workView) };
    },
    getFootprint: async (id) => projectFootprint(await engineApi.runs(id)),
    createProject: async ({ template, name }) => {
      const state = await engineApi.createProject(name, template);
      return projectView({ ...state.project, revision: state.revision.number });
    },
    projectScene: engineApi.scene,
  },
  prototype: createProjectsFixture,
});
