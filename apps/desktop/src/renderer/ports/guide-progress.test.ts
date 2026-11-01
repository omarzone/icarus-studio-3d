import type { Project } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isProject } from "../engine-client/response-checks.ts";
import { guideProgress } from "./guide-progress.ts";
import parking from "./testdata/parking-car.json";
import { status } from "./testdata/training-runs.ts";

const car = (() => {
  if (!isProject(parking.project)) {
    throw new Error("bad test data");
  }
  return parking.project;
})();

const empty: Project = { ...car, bodies: [], world: { ...car.world, objects: [] }, task: { ...car.task, rewards: [] } };

const withGoal = (project: Project): Project => ({
  ...project,
  world: {
    ...project.world,
    objects: [
      ...project.world.objects,
      { id: "goal", name: "Goal", parent: null, components: [{ id: "goal_zone", kind: "goal_zone", properties: {} }] },
    ],
  },
});

const done = (progress: ReturnType<typeof guideProgress>) =>
  Object.fromEntries((progress.steps ?? []).map((step) => [step.id, step.done]));

describe("guideProgress", () => {
  it("starts with nothing done in an empty world", () => {
    const progress = guideProgress(empty, []);
    expect(progress).toMatchObject({ started: false, done: 0, total: 4 });
    expect(done(progress)).toEqual({ body: false, goal: false, rewards: false, trained: false });
  });

  it("checks the body, the goal and the rewards from the project", () => {
    const progress = guideProgress(withGoal(car), []);
    expect(done(progress)).toEqual({ body: true, goal: true, rewards: true, trained: false });
    expect(progress).toMatchObject({ started: true, done: 3 });
  });

  it("counts a project as trained once a run saved a checkpoint better than random actions", () => {
    expect(done(guideProgress(car, [status({ state: "done", best_step: 0 })])).trained).toBe(false);
    expect(done(guideProgress(car, [status({ state: "stopped", best_step: 200_000 })])).trained).toBe(true);
  });

  it("says when a run is training right now", () => {
    const step = guideProgress(car, [status({ state: "running" })]).steps?.find((item) => item.id === "trained");
    expect(step).toEqual({ id: "trained", done: false, training: true });
  });
});
