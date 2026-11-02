// SCR-SETTINGS-TRAINING
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { settingsPort, type TrainingSettings } from "../../ports/settings-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { TextField } from "../../ui/text-field.tsx";
import { SettingSwitchRow } from "./setting-switch-row.tsx";
import { SettingsLayout } from "./settings-layout.tsx";

export function TrainingPage() {
  const settings = usePort(settingsPort);
  const query = useQuery({ queryKey: ["settings", "training"], queryFn: settings.getTraining });
  return (
    <SettingsLayout
      section="training"
      title="Training and hardware"
      description="Training runs on this computer. Nothing is uploaded."
    >
      <QueryView query={query}>{(training) => <TrainingForm training={training} />}</QueryView>
    </SettingsLayout>
  );
}

// A slider drawn as the style guide's progress bar; arrows and clicks change it.
function ThreadsBar({ threads, max, onChange }: { threads: number; max: number; onChange: (threads: number) => void }) {
  const set = (value: number) => onChange(Math.min(max, Math.max(1, value)));
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-labelledby="training-threads"
      aria-valuemin={1}
      aria-valuemax={max}
      aria-valuenow={threads}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          set(threads + 1);
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          set(threads - 1);
        }
      }}
      onPointerDown={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        set(Math.round(((event.clientX - box.left) / box.width) * max));
      }}
      className="h-1.5 rounded-bar bg-control-raised"
    >
      <div style={{ width: `${(threads / max) * 100}%` }} className="h-1.5 rounded-bar bg-fg" />
    </div>
  );
}

function TrainingForm({ training }: { training: TrainingSettings }) {
  const settings = usePort(settingsPort);
  const client = useQueryClient();
  const store = { onSuccess: (next: TrainingSettings) => client.setQueryData(["settings", "training"], next) };
  const setTraining = useEngineAction(settings.setTraining);
  const restart = useEngineAction(settings.restartEngine);
  const app = useRuntimeMode() === "app";
  const [folder, setFolder] = useState(training.projectsFolder);
  const [checkpoints, setCheckpoints] = useState(training.checkpoints);
  const free = training.maxThreads - training.threads;
  return (
    <>
      <div className="flex flex-col gap-2 rounded-card-sm bg-control p-3.5">
        <div className="flex leading-tight">
          <span id="training-threads" className="font-semibold">
            CPU threads for training
          </span>
          <span className="ml-auto font-mono">
            {training.threads} of {training.maxThreads}
          </span>
        </div>
        <ThreadsBar
          threads={training.threads}
          max={training.maxThreads}
          onChange={(threads) => setTraining.mutate({ threads }, store)}
        />
        <span className="text-ui leading-normal text-fg-tertiary">
          {free > 0
            ? `Leave ${free} free so the editor stays smooth while training.`
            : "Training uses every thread, so the editor may feel slow while it runs."}
        </span>
      </div>
      <SettingSwitchRow
        title="Use a graphics card when one is found"
        detail={
          training.graphicsCard === null
            ? "None found on this computer · training uses the CPU"
            : `${training.graphicsCard} found on this computer`
        }
        checked={training.useGraphicsCard}
        disabledReason={training.graphicsCard === null ? "No graphics card was found on this computer" : undefined}
        onChange={(value) => setTraining.mutate({ useGraphicsCard: value }, store)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Projects folder"
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
          onBlur={() => setTraining.mutate({ projectsFolder: folder }, store)}
        />
        <TextField
          label="Keep checkpoints"
          value={checkpoints}
          onChange={(event) => setCheckpoints(event.target.value)}
          onBlur={() => setTraining.mutate({ checkpoints }, store)}
        />
      </div>
      <div className="flex items-center gap-3 rounded-card-sm bg-control px-3.5 py-3">
        {training.engine.healthy ? (
          <Check size={16} strokeWidth={1.75} className="text-ok" aria-hidden />
        ) : (
          <TriangleAlert size={16} strokeWidth={1.75} className="text-warn" aria-hidden />
        )}
        <span className="flex-1">
          Engine running · version {training.engine.version} · {training.engine.healthy ? "healthy" : "not responding"}
        </span>
        {app ? (
          // The real restart keeps this screen; requests wait until the engine is back.
          <Act
            cta="Restart engine"
            disabled={restart.isPending}
            title="Stop and start the local engine again; a run that is training stops"
            onClick={() => restart.mutate(undefined)}
            className={buttonClass("secondary", "h-8.5 px-4 text-body")}
          >
            {restart.isPending ? "Restarting…" : "Restart engine"}
          </Act>
        ) : (
          <GoTo
            to="SYS-ENGINE-DOWN"
            cta="Restart engine"
            onClick={() => restart.mutate(undefined)}
            className={buttonClass("secondary", "h-8.5 px-4 text-body")}
          >
            Restart engine
          </GoTo>
        )}
      </div>
    </>
  );
}
