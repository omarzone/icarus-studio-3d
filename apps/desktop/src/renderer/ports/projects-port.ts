import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
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
};

export const projectsPort = definePort<ProjectsPort>({
  app: {
    listProjects: pending({ key: "projects.list", summary: "Your projects list", sprint: 2, ids: ["SCR-PROJECTS"] }),
    getProject: pending({ key: "projects.get", summary: "Opening a project", sprint: 2, ids: ["SCR-WORLD"] }),
    renameProject: pending({ key: "projects.rename", summary: "Renaming a project", sprint: 2, ids: ["MOD-RENAME"] }),
    duplicateProject: pending({
      key: "projects.duplicate",
      summary: "Duplicating a project",
      sprint: 2,
      ids: ["MOD-DUPLICATE"],
    }),
    deleteProject: pending({
      key: "projects.delete",
      summary: "Deleting a project",
      sprint: 2,
      ids: ["MOD-DELETE-PROJECT"],
    }),
    getFootprint: pending({
      key: "projects.footprint",
      summary: "What a project keeps on this computer",
      sprint: 2,
      ids: ["MOD-DUPLICATE", "MOD-DELETE-PROJECT"],
    }),
  },
  prototype: createProjectsFixture,
});
