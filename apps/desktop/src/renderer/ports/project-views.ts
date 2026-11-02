import type { ProjectSummary as EngineSummary, Revision, TemplateInfo } from "@icarus/contracts";
import type { ProjectSummary } from "./projects-port.ts";
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

export function projectView(summary: Pick<EngineSummary, "id" | "name" | "description" | "revision">): ProjectSummary {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description ?? "",
    status: "draft",
    statusLine: `Revision ${summary.revision} · design checks passed`,
    revision: `rev ${summary.revision}`,
  };
}

export function revisionViews(revisions: readonly Revision[], current: number, now: Date): RevisionSummary[] {
  return [...revisions]
    .sort((a, b) => b.number - a.number)
    .map((revision) => ({
      id: String(revision.number),
      change: revision.summary,
      author: revision.author === "copilot" ? "copilot" : "you",
      when: relativeTime(revision.created_at, now),
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
