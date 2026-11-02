import type { BuildStatus, DesignIdea, IdeaSet } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { buildProgressView, estimateText, ideaSetView } from "./ideas-views.ts";

const scene = { revision: 1, bodies: [], lights: [], geoms: [] };

const idea = (id: string, change: Partial<DesignIdea> = {}): DesignIdea => ({
  id,
  title: `Idea ${id}`,
  world: "Open lot · 6 spots",
  body: "Compact car · 8 sensors",
  learns: "Park in the free spot",
  template: "parking_car",
  family: "navigation",
  estimate_minutes: 40,
  recommended: false,
  scene,
  ...change,
});

describe("idea set view", () => {
  it("keeps the set id, each idea's compiled scene and which one is recommended", () => {
    const set: IdeaSet = {
      id: "set-1",
      prompt: "a car that parks",
      ideas: [idea("a", { recommended: true }), idea("b")],
    };
    const view = ideaSetView(set);
    expect(view.id).toBe("set-1");
    expect(view.mix).toBeNull();
    expect(view.ideas.map((item) => [item.id, item.recommended])).toEqual([
      ["a", true],
      ["b", false],
    ]);
    expect(view.ideas[0]?.scene).toBe(scene);
    expect(view.ideas[0]?.estimate).toBe("about 40 min");
  });
});

describe("training estimate", () => {
  it("reads as words at every scale", () => {
    expect(estimateText(0.2)).toBe("under a minute");
    expect(estimateText(1.4)).toBe("about 1 min");
    expect(estimateText(59.6)).toBe("about 1 h");
    expect(estimateText(70)).toBe("about 1 h 10 min");
    expect(estimateText(120)).toBe("about 2 h");
  });
});

describe("build progress view", () => {
  const status: BuildStatus = {
    build_id: "b1",
    project_id: null,
    progress: 0.4,
    activity: "Building the world",
    ready: false,
    steps: [
      { id: "read", label: "Reading the idea", status: "done" },
      { id: "world", label: "Building the world", status: "running" },
    ],
  };

  it("shows the real steps and what is happening now", () => {
    const view = buildProgressView(status);
    expect(view.steps).toEqual(status.steps);
    expect(view.activity).toBe("Building the world");
    expect(view.progress).toBe(0.4);
    expect(view.projectId).toBeNull();
    expect(view.error).toBeNull();
  });

  it("names the project once it exists and carries a failure in words", () => {
    const view = buildProgressView({ ...status, project_id: "park-1", error: "The car fell through the floor" });
    expect(view.projectId).toBe("park-1");
    expect(view.error).toBe("The car fell through the floor");
  });
});
