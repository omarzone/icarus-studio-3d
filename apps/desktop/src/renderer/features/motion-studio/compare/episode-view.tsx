import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { usePort } from "../../../app/runtime/port.tsx";
import { resultsPort } from "../../../ports/results-port.ts";
import { frameAt } from "../../../scene/rollout-player.ts";
import { RenderBoundary } from "../../../ui/render-boundary.tsx";
import { ErrorState, LoadingState } from "../../../ui/states.tsx";

// The 3D renderer is heavy, so it loads only once there is an episode to replay.
const SceneView = lazy(() => import("../../../scene/scene-view.tsx"));
const ignorePick = () => undefined;

type Props = { episode: { project: string; run: string; step: number }; caption: string; speed: string };

// Seconds into a looping episode, at the playback speed ("0.5×", "1×").
function useLoopTime(duration: number, speed: string): number {
  const [time, setTime] = useState(0);
  const rate = Number.parseFloat(speed) || 1;
  useEffect(() => {
    if (duration <= 0) {
      return;
    }
    const started = performance.now();
    let handle = requestAnimationFrame(function tick(now) {
      setTime((((now - started) / 1000) * rate) % duration);
      handle = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(handle);
  }, [duration, rate]);
  return time;
}

// The project's own body replaying the episode MuJoCo recorded for the compared checkpoint; nothing is animated here.
export function EpisodeView({ episode, caption, speed }: Props) {
  const results = usePort(resultsPort);
  const replay = useQuery({
    queryKey: ["motion-episode", episode.project, episode.run, episode.step],
    queryFn: () => results.getRecordingReplay(episode),
    // A recorded episode never changes.
    staleTime: Number.POSITIVE_INFINITY,
  });
  const frames = replay.data?.frames ?? [];
  const times = useMemo(() => frames.map((frame) => frame.time), [frames]);
  const time = useLoopTime(replay.data?.duration ?? 0, speed);
  const shown = frames[frameAt(times, (times[0] ?? 0) + time)];
  const signals = useMemo(() => [shown?.signals], [shown]);
  return (
    <div
      role="img"
      aria-label="The character copying the pose in physics"
      className="relative min-w-0 flex-1 overflow-hidden rounded-[14px] bg-app"
    >
      {replay.isError ? (
        <ErrorState title="The recorded episode could not load" body={replay.error.message} />
      ) : replay.data ? (
        <RenderBoundary
          fallback={(reason) => <ErrorState title="The 3D view could not start" body="" detail={reason} />}
        >
          <Suspense fallback={null}>
            <SceneView
              mode="play"
              description={replay.data.scene}
              poses={shown?.poses ?? new Map()}
              signals={signals}
              onPick={ignorePick}
            />
          </Suspense>
        </RenderBoundary>
      ) : (
        <LoadingState label="Loading the recorded episode" />
      )}
      <span className="absolute top-3 left-3 rounded-button bg-overlay px-2.5 py-1.5 text-ui">{caption}</span>
    </div>
  );
}
