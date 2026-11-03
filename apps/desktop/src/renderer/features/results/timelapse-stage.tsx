import type { SceneDescription } from "@icarus/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { resultsPort, type Timelapse } from "../../ports/results-port.ts";
import type { Replay } from "../../ports/training-port.ts";
import { frameAt, playerAt, scrub, togglePlaying } from "../../scene/rollout-player.ts";
import { useRolloutPlayer } from "../../scene/use-rollout-player.ts";
import { RenderBoundary } from "../../ui/render-boundary.tsx";
import { saveFile } from "../../ui/save-file.ts";
import { ErrorState, LoadingState } from "../../ui/states.tsx";
import { CheckpointStrip, TimelapseBar } from "./timelapse-controls.tsx";
import { resultsKeys } from "./use-results.ts";

// The 3D renderer is heavy, so it loads when the timelapse has an episode to draw.
const SceneView = lazy(() => import("../../scene/scene-view.tsx"));
const ignorePick = () => undefined;

type StageProps = { project: string; timelapse: Timelapse; run: string; onChoose: (id: string) => void };

const recordingKey = (project: string, run: string, step: number) =>
  [...resultsKeys.all(project), "recording", run, step] as const;

// Each checkpoint's recorded episode in the same scene; playing goes on to the next checkpoint when one ends.
export function TimelapseStage({ project, timelapse, run, onChoose }: StageProps) {
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const [chained, setChained] = useState(false);
  const index = Math.max(
    0,
    timelapse.frames.findIndex((frame) => frame.id === timelapse.current),
  );
  const frame = timelapse.frames[index];
  const next = timelapse.frames[index + 1];
  const load = (step: number) => () => port.getRecordingReplay({ project, run, step });
  const replay = useQuery({
    queryKey: recordingKey(project, run, frame?.step ?? -1),
    queryFn: load(frame?.step ?? 0),
    enabled: frame !== undefined,
    // A recorded episode never changes.
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(() => {
    if (next) {
      void client.prefetchQuery({
        queryKey: recordingKey(project, run, next.step),
        queryFn: load(next.step),
        staleTime: Number.POSITIVE_INFINITY,
      });
    }
  });
  // The scene is the run's frozen world for every checkpoint, so it is built once.
  const scene = useRef<{ run: string; description: SceneDescription } | null>(null);
  if (replay.data && scene.current?.run !== run) {
    scene.current = { run, description: replay.data.scene };
  }
  const ended = () => {
    if (chained && next) {
      onChoose(next.id);
      return;
    }
    setChained(false);
  };
  const strip = <CheckpointStrip timelapse={timelapse} onSelect={onChoose} />;
  return (
    <>
      <div className="absolute inset-0 bg-panel">
        {replay.isError ? (
          <ErrorState title="The recorded episode could not load" body={replay.error.message} />
        ) : replay.data && frame && scene.current ? (
          <EpisodePlayer
            key={`${run}:${frame.step}`}
            project={project}
            run={run}
            step={frame.step}
            replay={replay.data}
            scene={scene.current.description}
            autoplay={chained}
            onEnded={ended}
            onPlaying={setChained}
            strip={strip}
          />
        ) : (
          <LoadingState label="Loading the recorded episode" />
        )}
      </div>
      {replay.data ? null : (
        <div className="absolute inset-x-10 bottom-8 flex flex-col gap-3.5">
          {strip}
          <TimelapseBar played={0} at="0:00.0" length="0:00.0" playing={false} onToggle={() => undefined} />
        </div>
      )}
    </>
  );
}

type PlayerProps = {
  project: string;
  run: string;
  step: number;
  replay: Replay;
  scene: SceneDescription;
  autoplay: boolean;
  onEnded: () => void;
  onPlaying: (playing: boolean) => void;
  strip: ReactNode;
};

function EpisodePlayer({ project, run, step, replay, scene, autoplay, onEnded, onPlaying, strip }: PlayerProps) {
  const port = usePort(resultsPort);
  const exported = useEngineAction(port.exportRecording);
  const [player, setPlayer] = useRolloutPlayer(replay.duration, autoplay);
  const times = useMemo(() => replay.frames.map((frame) => frame.time), [replay]);
  const shownFrame = replay.frames[frameAt(times, (times[0] ?? 0) + player.time)];
  const signals = useMemo(() => [shownFrame?.signals], [shownFrame]);
  const shown = playerAt(player);
  const wasPlaying = useRef(autoplay);
  useEffect(() => {
    if (wasPlaying.current && !player.playing && player.time >= player.duration) {
      wasPlaying.current = false;
      onEnded();
      return;
    }
    wasPlaying.current = player.playing;
  });
  return (
    <>
      <RenderBoundary
        fallback={(reason) => (
          <ErrorState
            title="The 3D view could not start"
            body="The checkpoints are still listed below."
            detail={reason}
          />
        )}
      >
        <Suspense fallback={null}>
          <SceneView
            mode="play"
            description={scene}
            poses={shownFrame?.poses ?? new Map()}
            signals={signals}
            onPick={ignorePick}
          />
        </Suspense>
      </RenderBoundary>
      <span className="absolute top-32 left-10 rounded-card-sm bg-overlay px-3 py-2 text-ui text-fg-secondary">
        {replay.outcome}
      </span>
      <div className="absolute inset-x-10 bottom-8 flex flex-col gap-3.5">
        {strip}
        <TimelapseBar
          played={shown.played}
          at={shown.at}
          length={shown.length}
          playing={player.playing}
          onToggle={() => {
            onPlaying(!player.playing);
            setPlayer(togglePlaying);
          }}
          onScrub={(share) => setPlayer((state) => scrub(state, share))}
          onExport={() =>
            exported.mutate({ project, run, step }, { onSuccess: (file) => saveFile(file, `checkpoint-${step}.png`) })
          }
          exporting={exported.isPending}
        />
      </div>
    </>
  );
}
