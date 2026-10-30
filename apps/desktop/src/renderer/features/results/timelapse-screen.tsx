// SCR-TIMELAPSE
import { tokens } from "@icarus/ui-tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { useTitleBarHeight, WindowControlsSpace } from "../../app/shell/window-frame.tsx";
import { resultsPort, type Timelapse } from "../../ports/results-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { useProjectName } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { resultsKeys } from "./use-results.ts";

// Presentation mode: how it learned, full screen, with the real checkpoints and scores.
export function TimelapseScreen() {
  useTitleBarHeight(tokens.size.headerLauncher);
  const project = useProjectName("park-pilot").id;
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const timelapse = useQuery({ queryKey: resultsKeys.timelapse(project), queryFn: () => port.getTimelapse(project) });
  const select = useEngineAction(port.selectTimelapseFrame);
  const save = (next: Timelapse) => client.setQueryData(resultsKeys.timelapse(project), next);
  return (
    <div className="relative h-full overflow-hidden bg-app text-fg">
      <div role="img" aria-label="Replay of the checkpoints" className="absolute inset-0 bg-panel" />
      <header className="title-bar absolute inset-x-0 top-0 flex items-start gap-3 pt-8 pr-8 pl-10">
        <QueryView query={timelapse} loading={<span />}>
          {(data) => (
            <div className="flex flex-col gap-1">
              <span className="text-body text-fg-secondary">{data.eyebrow}</span>
              <h1 className="text-display font-bold">{data.title}</h1>
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
      {timelapse.data ? (
        <Controls timelapse={timelapse.data} onSelect={(id) => select.mutate({ project, id }, { onSuccess: save })} />
      ) : null}
    </div>
  );
}

function Controls({ timelapse, onSelect }: { timelapse: Timelapse; onSelect: (id: string) => void }) {
  return (
    <div className="absolute inset-x-10 bottom-8 flex flex-col gap-3.5">
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${timelapse.frames.length}, minmax(0, 1fr))` }}
      >
        {timelapse.frames.map((frame) => {
          const current = frame.id === timelapse.current;
          return (
            <Act
              key={frame.id}
              cta={frame.label}
              aria-current={current ? "true" : undefined}
              onClick={() => onSelect(frame.id)}
              className={`overflow-hidden rounded-card-sm text-left ${
                current ? "shadow-[0_0_0_2px_var(--ic-fg)]" : "opacity-75 hover:opacity-100"
              }`}
            >
              <span role="img" aria-label={frame.label} className="block h-22.5 bg-control" />
              <span className="block bg-overlay px-2 py-1.5 text-ui">{frame.label}</span>
            </Act>
          );
        })}
      </div>
      <div className="flex items-center gap-3.5">
        <Act
          cta="Play timelapse"
          aria-label="Play"
          className="grid size-10 place-items-center rounded-full bg-selected text-on-selected hover:opacity-90"
        >
          <Play size={10} fill="currentColor" aria-hidden />
        </Act>
        <span className="h-1 flex-1 rounded-bar bg-fill-track-off">
          <span className="block h-1 rounded-bar bg-fg" style={{ width: `${timelapse.played * 100}%` }} />
        </span>
        <span className="font-mono text-ui">
          {timelapse.at} / {timelapse.length}
        </span>
        <GoTo to="SCR-BUILD" cta="Export video" className={buttonClass("primary", "h-8.5! px-4! text-body!")}>
          Export video
        </GoTo>
      </div>
    </div>
  );
}
