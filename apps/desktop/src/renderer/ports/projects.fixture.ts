import type { ProjectFootprint, ProjectSummary, ProjectsPort } from "./projects-port.ts";

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
    lastScreen: "STA-BRAIN-CONNECTOME",
  },
  {
    id: "dance-copy",
    name: "Dance Copy",
    description: "A character that copies a dance from a video",
    status: "attention",
    statusLine: "Needs attention",
    revision: "r9",
    lastScreen: "SCR-MOTION",
  },
  {
    id: "tripod-jumper",
    name: "Tripod Jumper",
    description: "A three-legged robot that learns to jump",
    status: "published",
    statusLine: "Published",
    revision: "r21",
    votes: 128,
  },
  {
    id: "parallel-lots",
    name: "Parallel Lots",
    description: "Many parking lots training at once",
    status: "published",
    statusLine: "Published",
    revision: "r7",
    lastScreen: "SCR-TRAIN",
    votes: 46,
  },
  {
    id: "untitled",
    name: "Untitled project",
    description: "",
    status: "draft",
    statusLine: "Draft · yesterday",
    revision: "r1",
    lastScreen: "STA-WORLD-EMPTY-NOGUIDE",
  },
];

const FOOTPRINTS_FIXTURE: Readonly<Record<string, ProjectFootprint>> = {
  "park-pilot": { trainingRuns: 3, runsBytes: 1.8e9, runsFollowProject: true },
  "fruit-fly": { trainingRuns: 0, runsBytes: 0, runsFollowProject: true },
  "dance-copy": { trainingRuns: 2, runsBytes: 0.9e9, runsFollowProject: true },
};

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
      const taken = new Set(projects.map((item) => item.id));
      let copyId = `${id}-copy`;
      for (let n = 2; taken.has(copyId); n++) {
        copyId = `${id}-copy-${n}`;
      }
      const copy = { ...find(id), id: copyId, name, status: "draft" as const, statusLine: "Draft · now" };
      projects = [...projects, copy];
      return copy;
    },
    deleteProject: async (id) => {
      projects = projects.filter((item) => item.id !== id);
    },
    getFootprint: async (id) =>
      FOOTPRINTS_FIXTURE[find(id).id] ?? { trainingRuns: 0, runsBytes: 0, runsFollowProject: true },
    createProject: async ({ name }) => {
      const created = { ...find("park-pilot"), id: `new-${projects.length}`, name, status: "draft" as const };
      projects = [...projects, created];
      return created;
    },
    projectScene: null,
  };
}
