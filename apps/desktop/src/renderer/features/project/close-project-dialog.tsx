// The app's Close project, opened from POP-PROJECT-MENU: stops what the project still runs, then returns Home.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Act, CloseOverlay } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useNotices } from "../../app/runtime/notices.ts";
import { usePort } from "../../app/runtime/port.tsx";
import { type ProjectClosing, type ProjectSummary, type ProjectWork, projectsPort } from "../../ports/projects-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { dialogButtonClass } from "./dialog-controls.tsx";

const SAVED = "Every change is already saved.";

export function workLine(work: ProjectWork): string {
  const share = work.progress === null ? "" : ` · ${Math.round(work.progress * 100)}%`;
  switch (work.kind) {
    case "training":
      return `${work.title} is training${share}`;
    case "autopilot":
      return "The autopilot is driving the training";
    case "task":
      return `${work.title}${share}`;
  }
}

export function stillEndingNotice(left: readonly ProjectWork[]): { title: string; detail: string } | null {
  if (left.length === 0) {
    return null;
  }
  const names = left.map((work) => (work.kind === "autopilot" ? "The autopilot" : work.title)).join(", ");
  return { title: "Still finishing", detail: `${names} was asked to stop and ends on its own.` };
}

export function CloseProjectDialog({ project }: { project: ProjectSummary }) {
  const port = usePort(projectsPort);
  const client = useQueryClient();
  const go = useNavigation((state) => state.go);
  const notify = useNotices((state) => state.notify);
  const activity = useQuery({
    queryKey: ["projects", "activity", project.id],
    queryFn: () => port.projectActivity(project.id),
    staleTime: 0,
    gcTime: 0,
  });
  const leave = (closing: ProjectClosing | null) => {
    const notice = closing ? stillEndingNotice(closing.stillRunning) : null;
    if (notice) {
      notify(notice);
    }
    go("SCR-HOME", {});
    // Nothing of the closed project stays cached for the next one; Home lists the projects afresh.
    client.removeQueries({ predicate: (query) => query.queryKey.includes(project.id) });
    void client.invalidateQueries({ queryKey: ["projects", "list"] });
  };
  const close = useMutation({ mutationFn: () => port.closeProject(project.id), onSuccess: leave });
  const idle = activity.isSuccess && activity.data.length === 0;
  const start = close.mutate;
  useEffect(() => {
    if (idle) {
      start();
    }
  }, [idle, start]);

  const running = activity.data ?? [];
  const failed = activity.isError || close.isError;
  return (
    <Dialog
      title={`Close ${project.name}`}
      width="w-120"
      footer={
        idle && !close.isError ? null : (
          <>
            <CloseOverlay cta="Cancel" disabled={close.isPending} className={dialogButtonClass("secondary")}>
              Cancel
            </CloseOverlay>
            {failed ? (
              <Act cta="Close anyway" onClick={() => leave(null)} className={dialogButtonClass("secondary")}>
                Close anyway
              </Act>
            ) : null}
            {running.length > 0 && !failed ? (
              <Act
                cta="Stop and close"
                disabled={close.isPending}
                onClick={() => close.mutate()}
                className={dialogButtonClass("destructive")}
              >
                Stop and close
              </Act>
            ) : null}
          </>
        )
      }
    >
      <CloseBody project={project} running={running} activity={activity} pending={close.isPending} failed={failed} />
    </Dialog>
  );
}

type BodyProps = {
  project: ProjectSummary;
  running: readonly ProjectWork[];
  activity: { isPending: boolean };
  pending: boolean;
  failed: boolean;
};

function CloseBody({ project, running, activity, pending, failed }: BodyProps) {
  if (failed) {
    return (
      <p className="text-body text-fg-secondary">
        Icarus could not check or stop what {project.name} still runs. Closing anyway leaves it running. {SAVED}
      </p>
    );
  }
  if (activity.isPending) {
    return <Progress text={`Checking what ${project.name} still runs…`} />;
  }
  if (running.length === 0) {
    return <Progress text={`Closing ${project.name}. ${SAVED}`} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-fg-secondary">
        {pending
          ? "Stopping it now. Each run keeps its best brain."
          : `${project.name} is still running this. Closing stops all of it; each run keeps its best brain. ${SAVED}`}
      </p>
      <ul className="flex flex-col gap-1.5">
        {running.map((work) => (
          <li key={`${work.kind}-${work.id}`} className="flex items-center gap-2 text-body text-fg">
            {pending ? <Spinner /> : <span aria-hidden className="size-1.5 rounded-full bg-ok" />}
            {workLine(work)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Progress({ text }: { text: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-body text-fg-secondary">
      <Spinner />
      {text}
    </p>
  );
}

function Spinner() {
  return <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-fg border-r-transparent" />;
}
