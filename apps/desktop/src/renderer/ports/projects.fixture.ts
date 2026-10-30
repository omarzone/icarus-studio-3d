import type { ProjectSummary, ProjectsPort } from "./projects-port.ts";

// Sample data from the design mockups, used only by the prototype, the design gallery and tests.
export const PROJECTS_FIXTURE: readonly ProjectSummary[] = [
  {
    id: "park-pilot",
    name: "Park Pilot",
    description: "A car that learns to park with distance sensors",
    status: "training",
    statusLine: "Training · run 3 at 31%",
    revision: "r14",
  },
  {
    id: "fruit-fly",
    name: "Fruit Fly",
    description: "A real fly brain in a fly body",
    status: "tested",
    statusLine: "Connectome · tested",
    revision: "r6",
  },
  {
    id: "dance-copy",
    name: "Dance Copy",
    description: "A character that copies a dance from a video",
    status: "attention",
    statusLine: "Needs attention",
    revision: "r9",
  },
];

export function createProjectsFixture(): ProjectsPort {
  let projects = [...PROJECTS_FIXTURE];
  const find = (id: string) => {
    const project = projects.find((item) => item.id === id);
    if (!project) {
      throw new Error(`No project ${id}`);
    }
    return project;
  };
  return {
    listProjects: async () => projects,
    getProject: async (id) => find(id),
    renameProject: async ({ id, name, description }) => {
      const renamed = { ...find(id), name, description };
      projects = projects.map((item) => (item.id === id ? renamed : item));
      return renamed;
    },
    duplicateProject: async ({ id, name }) => {
      const copy = { ...find(id), id: `${id}-copy`, name, status: "draft" as const, statusLine: "Draft · now" };
      projects = [...projects, copy];
      return copy;
    },
    deleteProject: async (id) => {
      projects = projects.filter((item) => item.id !== id);
    },
  };
}
