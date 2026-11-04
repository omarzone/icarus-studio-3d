import type { EditOperation, LibraryCatalog, Project, ProjectState } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { createEngineBrainPort } from "./brain-engine.ts";
import parking from "./testdata/parking-car.json";

const { project, catalog } = (() => {
  if (!isProject(parking.project) || !isLibraryCatalog(parking.catalog)) {
    throw new Error("bad test data");
  }
  return { project: parking.project, catalog: parking.catalog };
})();

function stateOf(doc: Project): ProjectState {
  return {
    project: doc,
    revision: {
      number: 2,
      parent: 1,
      author: "user",
      summary: "s",
      operations: [],
      created_at: "",
      restored_from: null,
    },
    report: { ok: true, checks: [], duration_ms: 1 },
    can_undo: true,
    can_redo: false,
  };
}

function fakeApi() {
  const applyOperations = vi.fn(async (_id: string, operations: EditOperation[]) => {
    const removed = operations.flatMap((operation) => (operation.op === "remove_reward_term" ? [operation.term] : []));
    const rewards = project.task.rewards.filter((spec) => !removed.includes(spec.term));
    return stateOf({ ...project, task: { ...project.task, rewards } });
  });
  const api = {
    project: async () => stateOf(project),
    library: async (): Promise<LibraryCatalog> => catalog,
    applyOperations,
    runs: async () => [],
  };
  return { port: createEngineBrainPort(api), applyOperations };
}

describe("createEngineBrainPort", () => {
  it("sends a weight change as one validated reward operation on the project", async () => {
    const { port, applyOperations } = fakeApi();
    await port.setRewardWeight({ brain: "p1", id: "reach_goal", weight: 20 });
    expect(applyOperations).toHaveBeenCalledWith(
      "p1",
      [{ op: "set_reward_term", term: { term: "reach_goal", weight: 20, params: {} } }],
      "Changed the reach_goal weight",
    );
  });

  it("returns the reward the engine saved after removing a term", async () => {
    const { port } = fakeApi();
    const learning = await port.removeRewardTerm({ brain: "p1", id: "time_penalty" });
    expect(learning.reward.map((term) => term.id)).not.toContain("time_penalty");
  });
});
