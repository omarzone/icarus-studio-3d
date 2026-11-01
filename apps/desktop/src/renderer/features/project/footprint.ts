import { useQuery } from "@tanstack/react-query";
import { usePort } from "../../app/runtime/port.tsx";
import { projectsPort } from "../../ports/projects-port.ts";

export function useFootprint(projectId: string) {
  const port = usePort(projectsPort);
  return useQuery({ queryKey: ["projects", "footprint", projectId], queryFn: () => port.getFootprint(projectId) });
}
