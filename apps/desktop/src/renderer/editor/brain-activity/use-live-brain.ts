import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { LIVE } from "../../ports/brain-network-views.ts";
import { brainPort } from "../../ports/brain-port.ts";
import { type PlayListener, playPort } from "../../ports/play-port.ts";

// The brain views that follow the playing brain: activity, readings and the network at no or the live option.
export function followsLive(key: QueryKey, brain: string): boolean {
  if (key[0] !== "brain" || key[1] !== brain) {
    return false;
  }
  return (
    key[2] === "activity" || key[2] === "readings" || (key[2] === "network" && (key[3] === null || key[3] === LIVE))
  );
}

const QUIET: PlayListener = { onUpdate: () => undefined, onClosed: () => undefined, onError: () => undefined };

// Re-reads the live brain views whenever the brain playing the project computes something new or stops.
export function useLiveBrain(brain: string) {
  const port = usePort(brainPort);
  const client = useQueryClient();
  useEffect(
    () =>
      port.watchLive(brain, () => {
        void client.invalidateQueries({ predicate: (query) => followsLive(query.queryKey, brain) });
      }),
    [port, client, brain],
  );
}

// Plays the project's brain in the background while `on`, without a view, so the brain views can follow it live.
export function useLiveBrainStream(brain: string, on: boolean) {
  const play = usePort(playPort);
  const app = useRuntimeMode() === "app";
  useEffect(() => (app && on ? play.connect(brain, QUIET) : undefined), [play, app, brain, on]);
}
