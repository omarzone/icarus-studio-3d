import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNotices } from "../../app/runtime/notices.ts";
import { usePort } from "../../app/runtime/port.tsx";
import {
  type PlayBrainPick,
  type PlayLive,
  type PlaySession,
  type PlayStage,
  playPort,
} from "../../ports/play-port.ts";

export const playKey = (project: string) => ["play", project] as const;

const playLiveKey = (project: string) => ["play", project, "live"] as const;

const playBrainsKey = (project: string) => ["play", project, "brains"] as const;

const playProgressKey = (project: string) => ["play", project, "progress"] as const;

// Every trained brain of the project Play could use.
export function usePlayBrains(project: string) {
  const port = usePort(playPort);
  return useQuery({ queryKey: playBrainsKey(project), queryFn: () => port.brains(project) });
}

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

// Which brain plays, in words; it changes only when a new session starts.
export function usePlayBrain(project: string): string | undefined {
  const port = usePort(playPort);
  return useQuery({
    queryKey: playKey(project),
    queryFn: () => port.getSession(project),
    retry: false,
    select: (session: PlaySession) => session.decisions?.brain,
  }).data;
}

// The live world the Play viewport draws, written by the Play connection.
export function usePlayLive(project: string) {
  return useQuery<PlayLive>({ queryKey: playLiveKey(project), queryFn: skipToken });
}

// What the engine is doing while a session opens, as it reported it; nothing until its first report.
export function usePlayProgress(project: string) {
  return useQuery<PlayStage>({ queryKey: playProgressKey(project), queryFn: skipToken }).data;
}

// Writes what a Play action returned into the cache so every Play panel shows it at once.
export function usePlayCache(project: string) {
  const client = useQueryClient();
  return (session: PlaySession) => client.setQueryData(playKey(project), session);
}

// Streams the live session into the cache while Play is open, and disconnects on leave; a chosen `brain` plays
// instead of the default one.
export function usePlayConnection(
  project: string,
  brain?: PlayBrainPick,
): { closed: string | null; reconnect: () => void } {
  const port = usePort(playPort);
  const client = useQueryClient();
  const notify = useNotices((state) => state.notify);
  const [attempt, setAttempt] = useState(0);
  const [closed, setClosed] = useState<string | null>(null);
  const runId = brain?.runId;
  const step = brain?.step;
  useEffect(() => {
    setClosed(null);
    const chosen = runId !== undefined && step !== undefined ? { runId, step } : undefined;
    const disconnect = port.connect(
      project,
      {
        onUpdate: (session, live) => {
          client.setQueryData(playKey(project), session);
          client.setQueryData(playLiveKey(project), live);
        },
        onClosed: setClosed,
        onError: (message) => notify({ title: "That did not work", detail: message }),
        onProgress: (stage) => client.setQueryData(playProgressKey(project), stage),
      },
      chosen,
    );
    if (attempt > 0 || chosen) {
      // Reconnecting shows the connecting state until the new session's first frame.
      void client.resetQueries({ queryKey: playKey(project) });
    }
    return disconnect;
  }, [port, project, client, notify, attempt, runId, step]);
  return {
    closed,
    reconnect: () => {
      setClosed(null);
      setAttempt((count) => count + 1);
    },
  };
}
