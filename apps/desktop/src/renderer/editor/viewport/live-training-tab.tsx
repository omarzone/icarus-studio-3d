// TAB-LIVE-TRAINING
import type { SceneGeom } from "@icarus/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { lazy, Suspense, useContext, useMemo, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { LiveCopies } from "../../ports/training-port.ts";
import { copyGrid, gridPlayer } from "../../scene/copy-grid.ts";
import { RayViewContext } from "../../scene/ray-lines.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { RenderBoundary } from "../../ui/render-boundary.tsx";
import { EmptyState, ErrorState, LoadingState } from "../../ui/states.tsx";
import { useLiveCopies } from "../training-queries.ts";
import { RunProgress } from "./run-progress.tsx";
import { RunStarting } from "./run-starting.tsx";
import { ViewportSurface, type ViewportSurfaceProps } from "./viewport-surface.tsx";

// The 3D renderer is heavy, so it loads the first time the copies have a world to draw.
const SceneView = lazy(() => import("../../scene/scene-view.tsx"));

export type TrainingView = { project: string; onReconnect: () => void };

const ignorePick = () => undefined;

// Every parallel copy of the selected run as the engine sampled it last, side by side in a grid.
export function LiveTrainingTab({ training, ...surface }: ViewportSurfaceProps & { training?: TrainingView }) {
  return (
    <ViewportSurface {...surface}>
      {training ? <LiveCopiesView project={training.project} onReconnect={training.onReconnect} /> : null}
    </ViewportSurface>
  );
}

function LiveCopiesView({ project, onReconnect }: TrainingView) {
  const live = useLiveCopies(project).data;
  // The prototype streams nothing, so it draws nothing over the view.
  if (!live) {
    return null;
  }
  return (
    <div data-ui-id="TAB-LIVE-TRAINING" className="absolute inset-0">
      <LiveState live={live} onReconnect={onReconnect} />
    </div>
  );
}

function LiveState({ live, onReconnect }: { live: LiveCopies; onReconnect: () => void }) {
  switch (live.kind) {
    case "connecting":
      return <LoadingState label="Connecting to the run" />;
    case "message":
      return live.starting ? (
        <RunStarting title={live.title} body={live.body} />
      ) : (
        <EmptyState title={live.title} body={live.body} />
      );
    case "closed":
      return (
        <ErrorState
          title="The live view stopped"
          body="The run keeps training on the engine."
          detail={live.reason}
          action={
            <Act cta="Reconnect" onClick={onReconnect} className={buttonClass("primary")}>
              Reconnect
            </Act>
          }
        />
      );
    case "live":
      return <CopiesScene live={live} />;
  }
}

function CopiesScene({ live }: { live: Extract<LiveCopies, { kind: "live" }> }) {
  const { scene, copies } = live;
  // The grid's meshes only change with the scene or the number of copies; each snapshot only moves them.
  const [borders, setBorders] = useCopyBorders();
  const grid = useMemo(() => copyGrid(scene, copies.length, borders), [scene, copies.length, borders]);
  const poses = useMemo(() => grid.place(copies), [grid, copies]);
  // The camera's Follow mode tracks this copy's agent; grid geom names start with "<copy>:".
  const [picked, setPicked] = useState(0);
  const followed = Math.min(picked, Math.max(0, copies.length - 1));
  const follows = useMemo(() => (geom: SceneGeom) => geom.name.startsWith(`${followed}:`), [followed]);
  // Only the followed copy's rays by default, so many copies stay readable.
  const view = useContext(RayViewContext);
  const rays = useMemo(
    () => (view?.shown ? grid.placeRays(live.rays, view.allCopies ? undefined : followed) : undefined),
    [view?.shown, view?.allCopies, grid, live.rays, followed],
  );
  const raysOf = view?.shown ? (view.allCopies ? "all" : followed) : null;
  const player = useMemo(
    () => (live.player ? gridPlayer(live.player, grid, raysOf) : undefined),
    [live.player, grid, raysOf],
  );
  return (
    <>
      <RenderBoundary
        fallback={(reason) => (
          <ErrorState
            title="The 3D view could not start"
            body="The metrics and console still update."
            detail={reason}
          />
        )}
      >
        <Suspense fallback={null}>
          <SceneView
            mode="play"
            description={grid.description}
            poses={poses}
            player={player}
            onPick={ignorePick}
            framing={grid.extent}
            signals={live.signals}
            copies={copies.length}
            follows={follows}
            rays={rays}
            rayValues={view?.values}
          />
        </Suspense>
      </RenderBoundary>
      <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-1.5">
        {live.progress ? (
          <RunProgress copies={copies.length} progress={live.progress} />
        ) : (
          <span role="status" className="rounded-full bg-overlay px-3 py-1.5 font-mono text-meta">
            {copies.length} {copies.length === 1 ? "copy" : "copies"} · {live.step}
          </span>
        )}
        {copies.length > 1 ? <CopyPicker followed={followed} count={copies.length} onPick={setPicked} /> : null}
        {copies.length > 1 ? (
          <Act
            cta="Copy borders"
            aria-pressed={borders}
            title="Draw see-through walls between the copies; they are only drawn, the copies never share a world"
            onClick={() => setBorders(!borders)}
            className={`pointer-events-auto rounded-full px-3 py-1 text-meta ${
              borders ? "bg-selected text-on-selected" : "bg-overlay hover:bg-control-raised"
            } active:opacity-80`}
          >
            Copy borders
          </Act>
        ) : null}
        {live.note ? <span className="max-w-80 rounded-card-sm bg-overlay px-3 py-2 text-ui">{live.note}</span> : null}
      </div>
    </>
  );
}

const BORDERS_KEY = "icarus.live.copyBorders";

// Whether the live view draws borders between copies, remembered on this computer; on unless turned off.
function useCopyBorders(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return window.localStorage.getItem(BORDERS_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const set = (next: boolean) => {
    setOn(next);
    try {
      window.localStorage.setItem(BORDERS_KEY, next ? "on" : "off");
    } catch {
      // Remembering is a convenience; the toggle still works for this session.
    }
  };
  return [on, set];
}

const STEP_CLASS =
  "grid size-6 place-items-center rounded-full hover:bg-fill-hover active:opacity-80 disabled:opacity-40";

// Which copy the camera's Follow mode tracks.
function CopyPicker({ followed, count, onPick }: { followed: number; count: number; onPick: (copy: number) => void }) {
  return (
    <span className="pointer-events-auto flex items-center gap-1 rounded-full bg-overlay px-1.5 py-1 text-meta">
      <Act
        cta="Follow the previous copy"
        aria-label="Follow the previous copy"
        title="Follow the previous copy"
        disabled={followed === 0}
        onClick={() => onPick(followed - 1)}
        className={STEP_CLASS}
      >
        <ChevronLeft size={14} aria-hidden />
      </Act>
      <span className="font-mono">
        Following copy {followed + 1} of {count}
      </span>
      <Act
        cta="Follow the next copy"
        aria-label="Follow the next copy"
        title="Follow the next copy"
        disabled={followed >= count - 1}
        onClick={() => onPick(followed + 1)}
        className={STEP_CLASS}
      >
        <ChevronRight size={14} aria-hidden />
      </Act>
    </span>
  );
}
