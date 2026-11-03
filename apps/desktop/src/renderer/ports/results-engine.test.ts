import type { CheckpointInfo, Diagnosis, RunStatus } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { createEngineResultsPort, type NotesStore } from "./results-engine.ts";
import { diagnosis, group, proposal } from "./testdata/coach.ts";
import { checkpoint, status } from "./testdata/training-runs.ts";

type Api = NonNullable<Parameters<typeof createEngineResultsPort>[0]>;

const runs: RunStatus[] = [
  status({ best_step: 250_000 }),
  status({ run_id: "run-2", name: "Run 2", state: "done", best_step: 100_000, started_at: "2026-11-01T09:00:00Z" }),
  status({ run_id: "run-1", name: "Run 1", state: "done", started_at: "2026-11-01T08:00:00Z" }),
];
const checkpoints: Record<string, CheckpointInfo[]> = {
  "run-3": [checkpoint(250_000, 0.71, 8)],
  "run-2": [checkpoint(100_000, 0.3, 4)],
  "run-1": [checkpoint(100_000, 0.1, 2)],
};

function fakeApi(diagnoses: Record<string, Diagnosis[]> = {}): Api {
  return {
    runs: async () => runs,
    checkpoints: async (id) => checkpoints[id] ?? [],
    rollout: () => Promise.reject(new Error("no rollout")),
    runScene: () => Promise.reject(new Error("no scene")),
    conversation: async () => ({
      project_id: "p",
      messages: [],
      proposals: [proposal({ status: "outdated" })],
      autonomy: "ask",
      suggestions: [],
    }),
    diagnose: async (id) => diagnosis({ id: "new", run_id: id }),
    diagnoses: async (id) => diagnoses[id] ?? [],
    checkpointFailures: async (_id, step) => [group({ label: `Evaluated at ${step}` })],
  };
}

const links = async () => (id: string) => `frames/${id}`;
const memoryNotes = (): NotesStore => {
  const stored = new Map<string, string>();
  return { read: (project) => stored.get(project) ?? "", write: (project, text) => stored.set(project, text) };
};

describe("results on the engine", () => {
  it("keeps the chosen pair of runs between reads", async () => {
    const port = createEngineResultsPort(fakeApi(), links, memoryNotes());
    expect((await port.listRuns("p")).filter((run) => run.compared).map((run) => run.id)).toEqual(["run-3", "run-2"]);
    await port.toggleCompare({ project: "p", id: "run-1" });
    expect((await port.listRuns("p")).filter((run) => run.compared).map((run) => run.id)).toEqual(["run-2", "run-1"]);
    const comparison = await port.getComparison("p");
    expect(comparison.sides.map((side) => side.id)).toEqual(["run-1", "run-2"]);
    expect(comparison.basis).toBe("Seeds not recorded");
  });

  it("shows the newest diagnosis's failure groups, else the newest run's best checkpoint evaluation", async () => {
    const fresh = createEngineResultsPort(fakeApi(), links, memoryNotes());
    expect(await fresh.getFailures("p")).toMatchObject({
      total: "Run 3 · checkpoint 250k",
      groups: [{ title: "Evaluated at 250000", frame: "frames/frame-a" }],
    });
    const diagnosed = createEngineResultsPort(
      fakeApi({ "run-2": [diagnosis({ run_id: "run-2", step: 100_000 })] }),
      links,
      memoryNotes(),
    );
    expect(await diagnosed.getFailures("p")).toMatchObject({
      total: "Run 2 · checkpoint 100k",
      groups: [{ title: "Falls forward early" }],
    });
    expect(await diagnosed.getSummary({ project: "p", view: "failures" })).toMatchObject({
      title: "Run 2 · checkpoint 100k",
    });
  });

  it("lists diagnoses newest first with their proposal as the conversation has it", async () => {
    const port = createEngineResultsPort(
      fakeApi({
        "run-3": [diagnosis({ id: "late", created_at: "2026-11-01T12:00:00Z" })],
        "run-2": [diagnosis({ id: "early", run_id: "run-2" })],
      }),
      links,
      memoryNotes(),
    );
    const list = await port.listDiagnoses("p");
    expect(list.map((item) => [item.id, item.title])).toEqual([
      ["late", "Run 3 · checkpoint 250k"],
      ["early", "Run 2 · checkpoint 250k"],
    ]);
    expect(list[0]?.proposal?.status).toBe("outdated");
  });

  it("diagnoses the newest run unless told which", async () => {
    const api = fakeApi();
    const diagnose = vi.spyOn(api, "diagnose");
    const port = createEngineResultsPort(api, links, memoryNotes());
    await port.diagnose({ project: "p" });
    await port.diagnose({ project: "p", run: "run-1" });
    expect(diagnose.mock.calls.map(([id]) => id)).toEqual(["run-3", "run-1"]);
  });

  it("keeps notes per project", async () => {
    const port = createEngineResultsPort(fakeApi(), links, memoryNotes());
    await port.saveNotes({ project: "p", text: "turns too early" });
    expect(await port.getNotes("p")).toBe("turns too early");
    expect(await port.getNotes("q")).toBe("");
  });
});
