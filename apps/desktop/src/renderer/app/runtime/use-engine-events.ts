import type { TaskInfo } from "@icarus/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { openEngineEvents } from "../../engine-client/events-stream.ts";
import { eventInvalidations, withTaskProgress } from "./engine-event-effects.ts";
import { applyLiveTurnEvent, clearLiveTurn } from "./live-turn.ts";

export const tasksKey = (project: string) => ["tasks", project] as const;

// Keeps an open project in step with the engine: live copilot steps, fresh reads after changes, task progress.
export function useEngineEvents(project: string): void {
  const client = useQueryClient();
  useEffect(() => {
    const connection = openEngineEvents(project, {
      onEvent: (event) => {
        applyLiveTurnEvent(project, event);
        if (event.type === "task_progress") {
          client.setQueryData<TaskInfo[]>(tasksKey(project), (tasks) => withTaskProgress(tasks, event));
        }
        for (const queryKey of eventInvalidations(event, project)) {
          void client.invalidateQueries({ queryKey });
        }
      },
      // A lost or unreadable event is caught up by the next one that invalidates the same reads.
      onError: () => undefined,
    });
    return () => {
      connection.close();
      clearLiveTurn(project);
    };
  }, [client, project]);
}
