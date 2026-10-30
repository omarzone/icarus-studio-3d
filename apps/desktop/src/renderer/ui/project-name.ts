import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "../app/navigation/navigation-store.tsx";
import { usePort } from "../app/runtime/port.tsx";
import { projectsPort } from "../ports/projects-port.ts";

// Name of the open project: route parameter `project`, else the given example project (gallery and prototype).
export function useProjectName(fallbackId: string): { id: string; name: string } {
  const port = usePort(projectsPort);
  const id = useNavigation((state) => state.params.project) ?? fallbackId;
  const project = useQuery({ queryKey: ["projects", "get", id], queryFn: () => port.getProject(id) });
  return { id, name: project.data?.name ?? "Project" };
}
