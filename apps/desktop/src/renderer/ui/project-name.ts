import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "../app/navigation/navigation-store.tsx";
import { usePort } from "../app/runtime/port.tsx";
import type { Workspace } from "../app/shell/workspace-header/workspace-header.tsx";
import { projectsPort } from "../ports/projects-port.ts";

function useOpenProject(fallbackId: string) {
  const port = usePort(projectsPort);
  const id = useNavigation((state) => state.params.project) ?? fallbackId;
  const project = useQuery({ queryKey: ["projects", "get", id], queryFn: () => port.getProject(id) });
  return { id, project };
}

// Name of the open project: route parameter `project`, else the given example project (gallery and prototype).
export function useProjectName(fallbackId: string): { id: string; name: string } {
  const { id, project } = useOpenProject(fallbackId);
  return { id, name: project.data?.name ?? "Project" };
}

// Same name, but null while it loads, so headers do not flash a placeholder name.
export function useOpenProjectName(fallbackId: string): string | null {
  const { project } = useOpenProject(fallbackId);
  if (project.isPending) {
    return null;
  }
  return project.data?.name ?? "Project";
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
