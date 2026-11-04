import type { TaskInfo } from "@icarus/contracts";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { openEngineEvents } from "../../engine-client/events-stream.ts";
import { type SettingsPort, settingsPort } from "../../ports/settings-port.ts";
import { eventInvalidations, type RunEndedNotice, runEndedNotice, withTaskProgress } from "./engine-event-effects.ts";
import { applyLiveTurnEvent, clearLiveTurn } from "./live-turn.ts";
import { usePort } from "./port.tsx";

export const tasksKey = (project: string) => ["tasks", project] as const;

// Keeps an open project in step with the engine: live copilot steps, fresh reads after changes, task progress,
// and a system notification when a run ends while the window is in the background.
export function useEngineEvents(project: string): void {
  const client = useQueryClient();
  const settings = usePort(settingsPort);
  const notified = useRef(new Set<string>());
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
        const notice = runEndedNotice(event);
        // With the window focused the app already shows the end of the run.
        if (event.type === "run_event" && notice && !document.hasFocus() && !notified.current.has(event.run_id)) {
          notified.current.add(event.run_id);
          void notify(client, settings, notice);
        }
      },
      // A lost or unreadable event is caught up by the next one that invalidates the same reads.
      onError: () => undefined,
    });
    return () => {
      connection.close();
      clearLiveTurn(project);
    };
  }, [client, settings, project]);
}

// Respects the "A training run finishes" switch; settings that cannot be read keep its default, on.
async function notify(client: QueryClient, settings: SettingsPort, notice: RunEndedNotice): Promise<void> {
  const wanted = await client
    .fetchQuery({ queryKey: ["settings", "notifications"], queryFn: settings.getNotificationSettings })
    .then((values) => values.runFinished)
    .catch(() => true);
  if (wanted) {
    new Notification(notice.title, { body: notice.body });
  }
}
