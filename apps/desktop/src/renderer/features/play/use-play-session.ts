import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePort } from "../../app/runtime/port.tsx";
import { type PlaySession, playPort } from "../../ports/play-port.ts";

export const playKey = (project: string) => ["play", project] as const;

export function usePlaySession(project: string) {
  const port = usePort(playPort);
  return useQuery({ queryKey: playKey(project), queryFn: () => port.getSession(project) });
}

// Writes what a Play action returned into the cache so every Play panel shows it at once.
export function usePlayCache(project: string) {
  const client = useQueryClient();
  return (session: PlaySession) => client.setQueryData(playKey(project), session);
}
