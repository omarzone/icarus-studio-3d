import type { ScreenId } from "../app/navigation/catalog-id.ts";
import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { projectView } from "./project-views.ts";
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
};

// What a project keeps on this computer, for the duplicate and delete dialogs.
export type ProjectFootprint = {
  trainingRuns: number;
  // Size of the training runs and timelapses, in bytes.
  runsBytes: number;
};

export type ProjectsPort = {
  listProjects: () => Promise<ProjectSummary[]>;
  getProject: (id: string) => Promise<ProjectSummary>;
  renameProject: (input: { id: string; name: string; description: string }) => Promise<ProjectSummary>;
  duplicateProject: (input: { id: string; name: string; include: readonly string[] }) => Promise<ProjectSummary>;
  deleteProject: (id: string) => Promise<void>;
  getFootprint: (id: string) => Promise<ProjectFootprint>;
  createProject: (input: { template: string; name: string }) => Promise<ProjectSummary>;
};

export const projectsPort = definePort<ProjectsPort>({
  app: {
    listProjects: async () => (await engineApi.listProjects()).map(projectView),
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
    // Runs are not copied yet: there are none until training lands.
    duplicateProject: async ({ id, name }) => {
      const state = await engineApi.duplicateProject(id, name);
      return projectView({ ...state.project, revision: state.revision.number });
    },
    deleteProject: async (id) => {
      await engineApi.deleteProject(id);
    },
    getFootprint: async () => ({ trainingRuns: 0, runsBytes: 0 }),
    createProject: async ({ template, name }) => {
      const state = await engineApi.createProject(name, template);
      return projectView({ ...state.project, revision: state.revision.number });
    },
  },
  prototype: createProjectsFixture,
});
