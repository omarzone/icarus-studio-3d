import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNotices } from "../../app/runtime/notices.ts";
import { usePort } from "../../app/runtime/port.tsx";
import { type PlayLive, type PlaySession, playPort } from "../../ports/play-port.ts";

export const playKey = (project: string) => ["play", project] as const;

const playLiveKey = (project: string) => ["play", project, "live"] as const;

export function usePlaySession(project: string) {
  const port = usePort(playPort);
  return useQuery({ queryKey: playKey(project), queryFn: () => port.getSession(project), retry: false });
}

// Only what shapes the Play layout, so the workspace does not re-render with every live frame.
export function usePlayLayout(project: string) {
  const port = usePort(playPort);
  return useQuery({
    queryKey: playKey(project),
    queryFn: () => port.getSession(project),
    retry: false,
    select: (session: PlaySession) => ({ vision: session.vision !== undefined, activity: session.activity === true }),
  });
}

// The live world the Play viewport draws, written by the Play connection.
export function usePlayLive(project: string) {
  return useQuery<PlayLive>({ queryKey: playLiveKey(project), queryFn: skipToken });
}

// Writes what a Play action returned into the cache so every Play panel shows it at once.
export function usePlayCache(project: string) {
  const client = useQueryClient();
  return (session: PlaySession) => client.setQueryData(playKey(project), session);
}

// Streams the live session into the cache while Play is open, and disconnects on leave.
export function usePlayConnection(project: string): { closed: string | null; reconnect: () => void } {
  const port = usePort(playPort);
  const client = useQueryClient();
  const notify = useNotices((state) => state.notify);
  const [attempt, setAttempt] = useState(0);
  const [closed, setClosed] = useState<string | null>(null);
  useEffect(() => {
    const disconnect = port.connect(project, {
      onUpdate: (session, live) => {
        client.setQueryData(playKey(project), session);
        client.setQueryData(playLiveKey(project), live);
      },
      onClosed: setClosed,
      onError: (message) => notify({ title: "That did not work", detail: message }),
    });
    if (attempt > 0) {
      // Reconnecting shows the connecting state until the new session's first frame.
      void client.resetQueries({ queryKey: playKey(project) });
    }
    return disconnect;
  }, [port, project, client, notify, attempt]);
  return {
    closed,
    reconnect: () => {
      setClosed(null);
      setAttempt((count) => count + 1);
    },
  };
}
