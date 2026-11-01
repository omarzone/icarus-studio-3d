import type { SceneDocument } from "./scene-documents.fixture.ts";

// Sample documents of the Train and Results workspaces: the selected run in the inspector and the guide progress.
const EMPTY_TREE = { selected: null, sections: [] } as const;

export const TRAINING_SCENE_DOCUMENTS: Readonly<Record<string, SceneDocument>> = {
  "park-pilot-run": {
    tree: {
      selected: "run-3",
      sections: [{ label: "Runs", objects: [{ id: "run-3", name: "Run 3", icon: "brain", depth: 0 }] }],
    },
    inspections: {
      "run-3": {
        kind: "object",
        title: "Run 3",
        subtitle: "PPO · started 6 min ago",
        components: false,
        sections: [
          {
            id: "budget",
            title: "Budget",
            properties: [
              { id: "steps", label: "Steps", state: "locked", type: "readonly", value: "1M" },
              { id: "copies", label: "Parallel copies", state: "locked", type: "readonly", value: "16" },
            ],
          },
          {
            id: "autopilot",
            title: "Autopilot",
            properties: [
              { id: "mode", label: "Mode", state: "default", type: "panel", value: "Ask first", panel: "autopilot" },
              { id: "tries", label: "Tries left", state: "default", type: "readonly", value: "3 of 5" },
            ],
          },
        ],
      },
    },
    guide: { started: true, done: 4, total: 5 },
  },
  "park-pilot-results": { tree: EMPTY_TREE, inspections: {}, guide: { started: true, done: 5, total: 5 } },
  "fruit-fly-results": { tree: EMPTY_TREE, inspections: {}, guide: { started: false, done: 0, total: 5 } },
};
