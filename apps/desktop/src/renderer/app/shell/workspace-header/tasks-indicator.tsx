import type { TaskInfo } from "@icarus/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tasksApi } from "../../../engine-client/tasks-api.ts";
import { useAnchoredStyle } from "../../../ui/anchored.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { useDismiss } from "../../../ui/dismiss.ts";
import { Meter } from "../../../ui/meter.tsx";
import { Spinner } from "../../../ui/spinner.tsx";
import { Act } from "../../navigation/go-to.tsx";
import { tasksKey, useEngineEvents } from "../../runtime/use-engine-events.ts";

// The header's live work pill in the app: keeps the project in step with the engine and lists its running tasks.
export function TasksIndicator({ project }: { project: string }) {
  useEngineEvents(project);
  const client = useQueryClient();
  const tasks = useQuery({ queryKey: tasksKey(project), queryFn: () => tasksApi.list(project) });
  const cancel = useMutation({
    mutationFn: tasksApi.cancel,
    onSettled: () => client.invalidateQueries({ queryKey: tasksKey(project) }),
  });
  const button = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const inside = useMemo(() => [button, surface], []);
  useDismiss(open, inside, close);
  const placement = useAnchoredStyle(open, button, surface, "end");
  const running = (tasks.data ?? []).filter((task) => task.state === "running");
  const body = button.current?.ownerDocument.body;
  // Loading, empty, failed or engine away: nothing is running that the header could show.
  if (running.length === 0 && !open) {
    return null;
  }
  return (
    <>
      <Act
        ref={button}
        cta="Running tasks"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Work the engine is doing for this project"
        onClick={() => setOpen(!open)}
        className={buttonClass("ghost", "gap-2 rounded-full")}
      >
        <Spinner />
        {running.length === 1 ? "1 task" : `${running.length} tasks`}
      </Act>
      {open && body
        ? createPortal(
            <div
              ref={surface}
              role="dialog"
              aria-label="Running tasks"
              style={placement}
              className="fixed z-50 flex w-80 flex-col gap-3 rounded-[18px] border border-line-strong bg-panel p-4 text-fg shadow-popover"
            >
              <span className="font-semibold">Running tasks</span>
              {running.length === 0 ? (
                <span className="text-ui text-fg-tertiary">Nothing is running right now.</span>
              ) : (
                running.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    cancelling={cancel.isPending && cancel.variables === task.id}
                    onCancel={() => cancel.mutate(task.id)}
                  />
                ))
              )}
              {cancel.isError ? <span className="text-ui text-danger">The task could not be stopped.</span> : null}
            </div>,
            body,
          )
        : null}
    </>
  );
}

function TaskRow({ task, cancelling, onCancel }: { task: TaskInfo; cancelling: boolean; onCancel: () => void }) {
  const progress = task.progress ?? null;
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2 text-ui">
          <span className="truncate">{task.title}</span>
          {progress === null ? null : (
            <span className="ml-auto shrink-0 text-fg-tertiary">{Math.round(progress * 100)}%</span>
          )}
        </div>
        {progress === null ? null : <Meter ratio={progress} label={task.title} />}
      </div>
      <Act
        cta={`Stop ${task.title}`}
        title="Stop this task"
        disabled={cancelling}
        onClick={onCancel}
        className="flex size-7 shrink-0 items-center justify-center rounded-control text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80 disabled:opacity-50"
      >
        <X size={14} strokeWidth={1.75} aria-hidden />
      </Act>
    </div>
  );
}
