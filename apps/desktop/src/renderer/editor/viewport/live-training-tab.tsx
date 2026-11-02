// TAB-LIVE-TRAINING
import { lazy, Suspense, useMemo } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { LiveCopies } from "../../ports/training-port.ts";
import { copyGrid } from "../../scene/copy-grid.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { RenderBoundary } from "../../ui/render-boundary.tsx";
import { EmptyState, ErrorState, LoadingState } from "../../ui/states.tsx";
import { useLiveCopies } from "../training-queries.ts";
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
      return <EmptyState title={live.title} body={live.body} />;
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
  const grid = useMemo(() => copyGrid(scene, copies.length), [scene, copies.length]);
  const poses = useMemo(() => grid.place(copies), [grid, copies]);
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
            onPick={ignorePick}
            framing={grid.extent}
          />
        </Suspense>
      </RenderBoundary>
      <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-1.5">
        <span role="status" className="rounded-full bg-overlay px-3 py-1.5 font-mono text-meta">
          {copies.length} {copies.length === 1 ? "copy" : "copies"} · {live.step}
        </span>
        {live.note ? <span className="max-w-80 rounded-card-sm bg-overlay px-3 py-2 text-ui">{live.note}</span> : null}
      </div>
    </>
  );
}
