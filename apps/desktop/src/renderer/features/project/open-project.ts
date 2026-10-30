import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type ProjectSummary, projectsPort } from "../../ports/projects-port.ts";

// The open project is the `project` route parameter; without one (gallery, prototype start) the first listed project.
export function useOpenProject() {
  const port = usePort(projectsPort);
  const id = useNavigation((state) => state.params.project);
  return useQuery({
    queryKey: id ? ["projects", "get", id] : ["projects", "list"],
    queryFn: (): Promise<ProjectSummary | ProjectSummary[]> => (id ? port.getProject(id) : port.listProjects()),
    select: (data) => {
      const project = Array.isArray(data) ? data[0] : data;
      if (!project) {
        throw new Error("There is no project open");
      }
      return project;
    },
  });
}

// After any project action every view refetches, so the header, menu and lists show the new state.
// Not awaited: leaving the dialog must not wait for views that may no longer exist (a deleted project).
export function useRefreshAfterAction(): () => void {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries();
  };
}
