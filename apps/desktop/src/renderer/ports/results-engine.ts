import type { CheckpointInfo, CopilotProposal, Diagnosis, FailureGroup, RunStatus } from "@icarus/contracts";
import { pending } from "../app/runtime/pending.ts";
import { attachmentApi } from "../engine-client/attachment-api.ts";
import { type CoachApi, coachApi } from "../engine-client/coach-api.ts";
import { type EngineApi, engineApi } from "../engine-client/engine-api.ts";
import { compactNumber } from "../ui/compact-number.ts";
import { agentComparison } from "./agent-comparison.ts";
import { diagnosisView, failureReplay, failuresView, latestDiagnosis } from "./coach-views.ts";
import type { DiagnosisView, ResultsPort } from "./results-port.ts";
import {
  bestBrains,
  bestCheckpoint,
  bestSummary,
  defaultCompared,
  learningHistory,
  type RunRecord,
  resultRuns,
  runComparison,
  scoreSummary,
  toggleCompared,
} from "./results-views.ts";
import { isFinal } from "./training-views.ts";

// Results on the engine: runs and checkpoints over HTTP, failure groups and diagnoses from the coach.

type ResultsApi = Pick<EngineApi, "runs" | "checkpoints" | "rollout" | "conversation"> &
  Pick<CoachApi, "diagnose" | "diagnoses" | "checkpointFailures">;

export type FrameLinks = () => Promise<(attachmentId: string) => string>;

// Notes stay on this computer, per project.
export type NotesStore = { read: (project: string) => string; write: (project: string, text: string) => void };

export type EngineResultsPort = Pick<
  ResultsPort,
  | "listRuns"
  | "toggleCompare"
  | "listBestBrains"
  | "getSummary"
  | "getNotes"
  | "saveNotes"
  | "getComparison"
  | "getLearningHistory"
  | "getFailures"
  | "selectFailure"
  | "getFailureReplay"
  | "listDiagnoses"
  | "diagnose"
>;

type FailureSource = { record: RunRecord | undefined; step: number | undefined; groups: FailureGroup[]; label: string };

const notesKey = (project: string) => `icarus.results-notes.${project}`;

export const localNotes: NotesStore = {
  read: (project) => {
    try {
      return window.localStorage.getItem(notesKey(project)) ?? "";
    } catch {
      return "";
    }
  },
  write: (project, text) => {
    try {
      window.localStorage.setItem(notesKey(project), text);
    } catch {
      throw new Error("Notes could not be saved on this computer");
    }
  },
};

const frameLinks: FrameLinks = async () => (await attachmentApi.attachmentLinks()).content;

const referenceSummary = pending<[], never>({
  key: "results.referenceSummary",
  summary: "The overall match against recordings",
  sprint: 11,
  ids: ["STA-RESULTS-REFERENCE"],
});

export function createEngineResultsPort(
  api: ResultsApi = { ...engineApi, ...coachApi },
  links: FrameLinks = frameLinks,
  notes: NotesStore = localNotes,
): EngineResultsPort {
  const compared = new Map<string, string[]>();
  const selectedGroup = new Map<string, string>();
  // A finished run's checkpoints never change, so they are read once.
  const finished = new Map<string, CheckpointInfo[]>();

  const checkpointsOf = async (run: RunStatus): Promise<CheckpointInfo[]> => {
    const known = finished.get(run.run_id);
    if (known) {
      return known;
    }
    const checkpoints = await api.checkpoints(run.run_id);
    if (isFinal(run)) {
      finished.set(run.run_id, checkpoints);
    }
    return checkpoints;
  };

  const records = async (project: string): Promise<RunRecord[]> => {
    const runs = await api.runs(project);
    return Promise.all(runs.map(async (run) => ({ run, checkpoints: await checkpointsOf(run) })));
  };

  const comparedOf = (project: string, list: readonly RunRecord[]): string[] => {
    const ids = new Set(list.map((record) => record.run.run_id));
    const chosen = compared.get(project)?.filter((id) => ids.has(id));
    return chosen ?? defaultCompared(list);
  };

  const allDiagnoses = async (list: readonly RunRecord[]): Promise<Diagnosis[]> => {
    const each = await Promise.all(list.map((record) => api.diagnoses(record.run.run_id)));
    return each.flat();
  };

  const proposals = async (project: string): Promise<CopilotProposal[]> => {
    try {
      return (await api.conversation(project)).proposals;
    } catch {
      return [];
    }
  };

  const runName = (list: readonly RunRecord[], id: string) =>
    list.find((record) => record.run.run_id === id)?.run.name ?? "A run";

  // Failure groups of the newest diagnosis, else the evaluation of the newest run's best checkpoint.
  const failureSource = async (project: string): Promise<FailureSource> => {
    const list = await records(project);
    const latest = latestDiagnosis(await allDiagnoses(list));
    const record = latest ? list.find((item) => item.run.run_id === latest.run_id) : list[0];
    const step = latest?.step ?? (record ? bestCheckpoint(record)?.step : undefined);
    if (!record || step === undefined) {
      return { record, step, groups: [], label: "No checkpoint yet" };
    }
    const groups =
      latest && latest.failure_groups.length > 0
        ? latest.failure_groups
        : await api.checkpointFailures(record.run.run_id, step);
    return { record, step, groups, label: `${record.run.name} · checkpoint ${compactNumber(step)}` };
  };

  const failures = async (project: string) => {
    const [source, url] = await Promise.all([failureSource(project), links()]);
    return failuresView(source.groups, source.label, selectedGroup.get(project), url);
  };

  return {
    listRuns: async (project) => {
      const list = await records(project);
      return resultRuns(list, comparedOf(project, list));
    },
    toggleCompare: async ({ project, id }) => {
      const list = await records(project);
      const next = toggleCompared(comparedOf(project, list), id);
      compared.set(project, next);
      return resultRuns(list, next);
    },
    listBestBrains: async (project) => bestBrains(await records(project)),
    getSummary: async ({ project, view }) => {
      switch (view) {
        case "best":
          return bestSummary(await records(project));
        case "failures": {
          const source = await failureSource(project);
          return scoreSummary(source.record, source.step);
        }
        case "reference":
          return referenceSummary();
      }
    },
    getNotes: async (project) => notes.read(project),
    saveNotes: async ({ project, text }) => {
      notes.write(project, text);
      return text;
    },
    getComparison: async (project) => {
      const list = await records(project);
      const agents = agentComparison(list) ?? undefined;
      const ids = comparedOf(project, list);
      const sides = list
        .filter((record) => ids.includes(record.run.run_id))
        .sort((a, b) => Date.parse(a.run.started_at) - Date.parse(b.run.started_at));
      const withSeeds = await Promise.all(
        sides.map(async (record) => {
          const best = bestCheckpoint(record);
          if (!best?.has_rollout) {
            return { ...record, seeds: null };
          }
          const rollout = await api.rollout(record.run.run_id, best.step).catch(() => null);
          return { ...record, seeds: rollout?.seed ?? null };
        }),
      );
      return { ...runComparison(withSeeds), agents };
    },
    getLearningHistory: async (project) => learningHistory((await records(project))[0]),
    getFailures: failures,
    selectFailure: async ({ project, id }) => {
      selectedGroup.set(project, id);
      return failures(project);
    },
    getFailureReplay: async (project) => {
      const [source, url] = await Promise.all([failureSource(project), links()]);
      return failureReplay(source.groups, selectedGroup.get(project), source.label, url);
    },
    listDiagnoses: async (project) => {
      const list = await records(project);
      const [diagnoses, known] = await Promise.all([allDiagnoses(list), proposals(project)]);
      return diagnoses
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .map((item) => diagnosisView(item, runName(list, item.run_id), known));
    },
    diagnose: async ({ project, run }): Promise<DiagnosisView> => {
      const list = await records(project);
      const target = run ?? list[0]?.run.run_id;
      if (target === undefined) {
        throw new Error("Train a run first: the coach diagnoses a run's checkpoints");
      }
      const made = await api.diagnose(target);
      return diagnosisView(made, runName(list, target), await proposals(project));
    },
  };
}
