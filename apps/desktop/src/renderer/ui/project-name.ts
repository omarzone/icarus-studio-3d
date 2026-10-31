import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "../app/navigation/navigation-store.tsx";
import { usePort } from "../app/runtime/port.tsx";
import type { Workspace } from "../app/shell/workspace-header/workspace-header.tsx";
import { projectsPort } from "../ports/projects-port.ts";
import type { GuideProgress } from "../ports/scene-port.ts";

// Name of the open project: route parameter `project`, else the workspace's own project (gallery, prototype).
// Null while it loads, so headers do not flash a placeholder name.
export function useOpenProjectName(fallbackId: string): string | null {
  const port = usePort(projectsPort);
  const id = useNavigation((state) => state.params.project) ?? fallbackId;
  const project = useQuery({ queryKey: ["projects", "get", id], queryFn: () => port.getProject(id) });
  if (project.isPending) {
    return null;
  }
  return project.data?.name ?? "Project";
}

// Header guide pill: "Getting started n/5" while the guide is active, "Guide" when hidden.
export function guidePillLabel(guide: GuideProgress | undefined): string {
  return guide?.started ? `Getting started ${guide.done}/${guide.total}` : "Guide";
}

// Projects whose body is a character with motion clips also have the Motion workspace.
export const CHARACTER_WORKSPACES: readonly Workspace[] = [
  "World",
  "Body",
  "Motion",
  "Brain",
  "Train",
  "Results",
  "Build",
];
