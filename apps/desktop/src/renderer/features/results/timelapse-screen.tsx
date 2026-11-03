// SCR-TIMELAPSE
import { tokens } from "@icarus/ui-tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { useTitleBarHeight, WindowControlsSpace } from "../../app/shell/window-frame.tsx";
import { resultsPort, type Timelapse } from "../../ports/results-port.ts";
import { useOpenProjectId } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState, NoProjectState } from "../../ui/states.tsx";
import { CheckpointStrip, TimelapseBar } from "./timelapse-controls.tsx";
import { TimelapseStage } from "./timelapse-stage.tsx";
import { resultsKeys } from "./use-results.ts";

// Presentation mode: how it learned, full screen, replaying each checkpoint's recorded episode in one scene.
export function TimelapseScreen() {
  useTitleBarHeight(tokens.size.headerLauncher);
  const project = useOpenProjectId("park-pilot");
  if (project === null) {
    return (
      <div className="h-full bg-app text-fg">
        <NoProjectState />
      </div>
    );
  }
  return <Presentation project={project} />;
}

function Presentation({ project }: { project: string }) {
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const app = useRuntimeMode() === "app";
  const timelapse = useQuery({ queryKey: resultsKeys.timelapse(project), queryFn: () => port.getTimelapse(project) });
  const select = useEngineAction(port.selectTimelapseFrame);
  const save = (next: Timelapse) => client.setQueryData(resultsKeys.timelapse(project), next);
  const choose = (id: string) => select.mutate({ project, id }, { onSuccess: save });
  const data = timelapse.data;
  return (
    <div className="relative h-full overflow-hidden bg-app text-fg">
      {data?.run ? (
        <TimelapseStage project={project} timelapse={data} run={data.run} onChoose={choose} />
      ) : (
        <div role="img" aria-label="Replay of the checkpoints" className="absolute inset-0 bg-panel">
          {app && data && data.frames.length === 0 ? (
            <EmptyState
              title="No recorded episodes yet"
              body="Every checkpoint records one test episode; train a run to watch how it learned."
            />
          ) : null}
        </div>
      )}
      <header className="title-bar absolute inset-x-0 top-0 flex items-start gap-3 pt-8 pr-8 pl-10">
        <QueryView query={timelapse} loading={<span />}>
          {(shown) => (
            <div className="flex flex-col gap-1">
              <span className="text-body text-fg-secondary">{shown.eyebrow}</span>
              <h1 className="text-display font-bold">{shown.title}</h1>
            </div>
          )}
        </QueryView>
        <GoTo
          to="SCR-TRAIN"
          cta="Exit presentation"
          className="ml-auto flex h-9 items-center rounded-full bg-overlay px-3.5 hover:bg-control-raised active:opacity-80"
        >
          Exit presentation
        </GoTo>
        <WindowControlsSpace side="end" />
      </header>
      {data && !data.run && data.frames.length > 0 ? (
        <div className="absolute inset-x-10 bottom-8 flex flex-col gap-3.5">
          <CheckpointStrip timelapse={data} onSelect={choose} />
          <TimelapseBar played={0} at="0:00.0" length="0:00.0" playing={false} onToggle={() => undefined} />
        </div>
      ) : null}
    </div>
  );
}
