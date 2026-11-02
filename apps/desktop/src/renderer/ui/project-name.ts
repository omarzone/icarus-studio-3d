import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "../app/navigation/navigation-store.tsx";
import { usePort, useRuntimeMode } from "../app/runtime/port.tsx";
import type { Workspace } from "../app/shell/workspace-header/workspace-header.tsx";
import { projectsPort } from "../ports/projects-port.ts";
import { openProjectId, sampleDocumentKey } from "./project-key.ts";

// The open project's document in the app, the workspace's sample in the prototype; null in the app with no project.
export function useProjectKey(sample: string): string | null {
  const mode = useRuntimeMode();
  const project = useNavigation((state) => state.params.project);
  return sampleDocumentKey(mode, project, sample);
}

// The open project's id; the example project only in the prototype; null in the app while none is open.
export function useOpenProjectId(fallbackId: string): string | null {
  const mode = useRuntimeMode();
  const project = useNavigation((state) => state.params.project);
  return openProjectId(mode, project, fallbackId);
}

function useOpenProject(fallbackId: string) {
  const port = usePort(projectsPort);
  const id = useOpenProjectId(fallbackId);
  const project = useQuery({
    queryKey: ["projects", "get", id ?? ""],
    queryFn: () => port.getProject(id ?? ""),
    enabled: id !== null,
  });
  return { id, project };
}

// The open project: route parameter `project`, else the given example project (gallery and prototype only).
// Its id is null in the app while no project is open.
export function useProjectName(fallbackId: string): { id: string | null; name: string } {
  const { id, project } = useOpenProject(fallbackId);
  return { id, name: project.data?.name ?? "Project" };
}

// Same name, but null while it loads (or while no project is open), so headers do not flash a placeholder name.
export function useOpenProjectName(fallbackId: string): string | null {
  const { id, project } = useOpenProject(fallbackId);
  if (id === null || project.isPending) {
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
