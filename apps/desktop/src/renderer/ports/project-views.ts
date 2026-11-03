import type {
  ProjectSummary as EngineSummary,
  ProjectWork as EngineWork,
  Revision,
  RunStatus,
  TemplateInfo,
} from "@icarus/contracts";
import type { ProjectFootprint, ProjectSummary, ProjectWork } from "./projects-port.ts";
import type { RevisionSummary } from "./revisions-port.ts";
import type { TemplateSummary } from "./templates-port.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now: Date): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (elapsed < MINUTE) {
    return "just now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`;
  }
  if (elapsed < 2 * DAY) {
    return "yesterday";
  }
  return `${Math.floor(elapsed / DAY)} days ago`;
}

// The time of a save: the clock time when it was today, else how long ago ("yesterday", "3 days ago").
export function savedTime(iso: string, now: Date): string {
  const saved = new Date(iso);
  if (saved.toDateString() !== now.toDateString()) {
    return relativeTime(iso, now);
  }
  return `${String(saved.getHours()).padStart(2, "0")}:${String(saved.getMinutes()).padStart(2, "0")}`;
}

type SummaryFields = Pick<EngineSummary, "id" | "name" | "description" | "revision"> & { updated_at?: string };

export function projectView(summary: SummaryFields): ProjectSummary {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description ?? "",
    status: "draft",
    statusLine: `Revision ${summary.revision} · design checks passed`,
    revision: `rev ${summary.revision}`,
    updatedAt: summary.updated_at,
  };
}

const LIVE: ReadonlySet<RunStatus["state"]> = new Set(["starting", "running", "stopping"]);

// A project is training while one of its runs is live; otherwise its summary stays as the revision left it.
export function withRuns(summary: ProjectSummary, runs: readonly RunStatus[]): ProjectSummary {
  const live = runs.find((run) => LIVE.has(run.state));
  if (!live) {
    return summary;
  }
  const percent = live.total_steps > 0 ? Math.floor((live.step / live.total_steps) * 100) : 0;
  return { ...summary, status: "training", statusLine: `Training · ${live.name} at ${percent}%` };
}

// Runs live in the engine's runs folder, apart from the project: deleting a project keeps them and duplicating
// does not copy them, and the engine does not measure their size.
export function projectFootprint(runs: readonly RunStatus[]): ProjectFootprint {
  return { trainingRuns: runs.length, runsBytes: null, runsFollowProject: false };
}

export function workView(work: EngineWork): ProjectWork {
  return { kind: work.kind, id: work.id, title: work.title, progress: work.progress ?? null };
}

export function revisionViews(revisions: readonly Revision[], current: number, now: Date): RevisionSummary[] {
  return [...revisions]
    .sort((a, b) => b.number - a.number)
    .map((revision) => ({
      id: String(revision.number),
      change: revision.summary,
      author: revision.author === "copilot" ? "copilot" : "you",
      when: relativeTime(revision.created_at, now),
      savedAt: savedTime(revision.created_at, now),
      current: revision.number === current,
    }));
}

export function templateView(info: TemplateInfo): TemplateSummary {
  return {
    id: info.id,
    name: info.label,
    description: info.description,
    kind: info.id === "empty_world" ? "empty-world" : "example",
  };
}
