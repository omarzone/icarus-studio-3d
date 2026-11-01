import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { projectsPort } from "../../ports/projects-port.ts";

export type BuildProject = { id: string; name: string };

// The open project: route parameter `project`, else the first project (gallery).
export function useBuildProject(): BuildProject {
  const port = usePort(projectsPort);
  const id = useNavigation((state) => state.params.project);
  const project = useQuery({
    queryKey: id ? ["projects", "get", id] : ["projects", "list"],
    queryFn: async () => (id ? port.getProject(id) : port.listProjects()),
  });
  const data = project.data;
  const found = Array.isArray(data) ? data[0] : data;
  return { id: found?.id ?? id ?? "", name: found?.name ?? "Project" };
}

// While a dialog is open over Build, its in-place controls lead back to the Build workspace instead.
export function useUnderOverlay(): boolean {
  return useNavigation((state) => state.overlay !== null);
}
