import type { ProjectSummary } from "../../ports/projects-port.ts";

// The projects touched last, opened or edited, newest first; `opened` says when one was last opened, if known.
export function recentProjects(
  projects: readonly ProjectSummary[],
  opened: (id: string) => number | null,
  limit: number,
): ProjectSummary[] {
  const touched = (project: ProjectSummary): number => {
    const edited = project.updatedAt ? Date.parse(project.updatedAt) : Number.NaN;
    return Math.max(opened(project.id) ?? 0, Number.isFinite(edited) ? edited : 0);
  };
  return [...projects].sort((a, b) => touched(b) - touched(a)).slice(0, limit);
}
