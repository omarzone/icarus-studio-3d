import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { projectsPort } from "../../ports/projects-port.ts";

export const UNTITLED_PROJECT = "Untitled project";

// Name of the open project: route parameter `project`, else the first project (gallery); none before it exists.
export function useProjectName(hasProject: boolean): string {
  const port = usePort(projectsPort);
  const id = useNavigation((state) => state.params.project);
  const project = useQuery({
    queryKey: id ? ["projects", "get", id] : ["projects", "list"],
    queryFn: async () => (id ? port.getProject(id) : port.listProjects()),
    enabled: hasProject,
  });
  if (!hasProject) {
    return UNTITLED_PROJECT;
  }
  const data = project.data;
  const name = Array.isArray(data) ? data[0]?.name : data?.name;
  return name ?? "Project";
}
