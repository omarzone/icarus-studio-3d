// TAB-REPLAY
import { Pause, Play } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { CheckpointMark, Replay } from "../../ports/training-port.ts";
import { frameAt, nextSpeed, playerAt, scrub, togglePlaying } from "../../scene/rollout-player.ts";
import { useRolloutPlayer } from "../../scene/use-rollout-player.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { RenderBoundary } from "../../ui/render-boundary.tsx";
import { Select } from "../../ui/select.tsx";
import { EmptyState, ErrorState, LoadingState } from "../../ui/states.tsx";
import { useCheckpoints, useReplay } from "../training-queries.ts";
import type { TrainingView } from "./live-training-tab.tsx";
import { ViewportSurface, type ViewportSurfaceProps } from "./viewport-surface.tsx";

// The 3D renderer is heavy, so it loads the first time a replay has a world to draw.
const SceneView = lazy(() => import("../../scene/scene-view.tsx"));

const SCRUB_STEPS = 1000;
const ignorePick = () => undefined;

// Replay of any checkpoint's recorded episode, exactly as MuJoCo computed it: play, scrub and change speed.
// `start` is a checkpoint to open on and play at once, as the live view's episode bar asks.
export function ReplayTab({
  training,
  start = null,
  ...surface
}: ViewportSurfaceProps & { training?: TrainingView; start?: number | null }) {
  return (
    <ViewportSurface {...surface}>
      {training ? (
        <div data-ui-id="TAB-REPLAY" className="absolute inset-0 bg-panel">
          <Checkpoints project={training.project} start={start} />
        </div>
      ) : null}
    </ViewportSurface>
  );
}

function defaultStep(marks: readonly CheckpointMark[]): number | null {
  const replayable = marks.filter((mark) => mark.replayable);
  return (replayable.find((mark) => mark.best) ?? replayable.at(-1))?.step ?? null;
}

function Checkpoints({ project, start }: { project: string; start: number | null }) {
  const checkpoints = useCheckpoints(project);
  const [chosen, setChosen] = useState<number | null>(start);
  return (
    <QueryView
      query={checkpoints}
      isEmpty={(marks) => defaultStep(marks) === null}
      empty={
        <EmptyState
          title="No recorded episodes yet"
          body="Every checkpoint records one test episode; the first is saved at step 0."
        />
      }
    >
      {(marks) => {
        const step = chosen !== null && marks.some((mark) => mark.step === chosen) ? chosen : defaultStep(marks);
        return step === null ? null : (
          <ReplayLoader project={project} marks={marks} step={step} autoplay={step === start} onChoose={setChosen} />
        );
      }}
    </QueryView>
  );
}

type LoaderProps = {
  project: string;
  marks: readonly CheckpointMark[];
  step: number;
  autoplay: boolean;
  onChoose: (step: number) => void;
};

function ReplayLoader({ project, marks, step, autoplay, onChoose }: LoaderProps) {
  const replay = useReplay(project, step);
  return (
    <QueryView query={replay} loading={<LoadingState label="Loading the recorded episode" />}>
      {(data) => (
        <ReplayPlayer key={step} replay={data} marks={marks} step={step} autoplay={autoplay} onChoose={onChoose} />
      )}
    </QueryView>
  );
}

type PlayerProps = {
  replay: Replay;
  marks: readonly CheckpointMark[];
  step: number;
  autoplay: boolean;
  onChoose: (step: number) => void;
};

function ReplayPlayer({ replay, marks, step, autoplay, onChoose }: PlayerProps) {
  const [player, setPlayer] = useRolloutPlayer(replay.duration, autoplay);
  const times = useMemo(() => replay.frames.map((frame) => frame.time), [replay]);
  const start = times[0] ?? 0;
  const shownFrame = replay.frames[frameAt(times, start + player.time)];
  const poses = shownFrame?.poses ?? new Map();
  const signals = useMemo(() => [shownFrame?.signals], [shownFrame]);
  const shown = playerAt(player);
  const mark = marks.find((item) => item.step === step);
  const options = marks
    .filter((item) => item.replayable)
    .map((item) => ({ value: String(item.step), label: item.best ? `${item.label} · best` : item.label }));
  return (
    <>
      <RenderBoundary
        fallback={(reason) => (
          <ErrorState title="The 3D view could not start" body="The metrics still show the run." detail={reason} />
        )}
      >
        <Suspense fallback={null}>
          <SceneView mode="play" description={replay.scene} poses={poses} signals={signals} onPick={ignorePick} />
        </Suspense>
      </RenderBoundary>
      <div className="absolute top-3 right-3 flex max-w-80 flex-col gap-0.5 rounded-card-sm bg-overlay px-3.25 py-2.5">
        <span className="text-headline font-semibold">{replay.label}</span>
        {mark ? <span className="text-ui text-fg-secondary">{mark.result}</span> : null}
        <span className="text-ui text-fg-secondary">{replay.outcome}</span>
      </div>
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-card-sm bg-overlay px-3 py-2">
        <Act
          cta={player.playing ? "Pause the replay" : "Play the replay"}
          aria-label={player.playing ? "Pause" : "Play"}
          onClick={() => setPlayer(togglePlaying)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-selected text-on-selected hover:opacity-90 active:opacity-80"
        >
          {player.playing ? (
            <Pause size={10} fill="currentColor" aria-hidden />
          ) : (
            <Play size={10} fill="currentColor" aria-hidden />
          )}
        </Act>
        <span className="font-mono text-meta">{shown.at}</span>
        <input
          type="range"
          data-cta="scrub-the-replay"
          aria-label="Scrub the replay"
          min={0}
          max={SCRUB_STEPS}
          value={Math.round(shown.played * SCRUB_STEPS)}
          onChange={(event) => {
            // Read now: the updater runs after React has let go of the event.
            const share = Number(event.currentTarget.value) / SCRUB_STEPS;
            setPlayer((state) => scrub(state, share));
          }}
          className="h-1 min-w-0 flex-1 accent-fg hover:opacity-90 active:opacity-80"
        />
        <span className="font-mono text-meta text-fg-tertiary">{shown.length}</span>
        <Act
          cta="Replay speed"
          aria-label={`Replay speed ${shown.speed}`}
          onClick={() => setPlayer(nextSpeed)}
          className="inline-flex h-6.5 shrink-0 items-center rounded-full bg-fill-hover px-2.5 text-ui text-fg-tool hover:bg-control-raised hover:text-fg active:opacity-80"
        >
          {shown.speed}
        </Act>
        <Select
          label="Checkpoint to replay"
          value={String(step)}
          options={options}
          onChange={(value) => onChoose(Number(value))}
          className="h-6.5 rounded-control bg-control px-2.5 text-ui hover:bg-control-raised"
        />
      </div>
    </>
  );
}
