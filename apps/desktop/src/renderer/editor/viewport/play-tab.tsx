// TAB-PLAY
import { lazy, Suspense, useContext } from "react";
import type { PlayLive } from "../../ports/play-port.ts";
import { RayViewContext } from "../../scene/ray-lines.ts";
import type { ScenePick } from "../../scene/scene-view.tsx";
import { RenderBoundary } from "../../ui/render-boundary.tsx";
import { ErrorState } from "../../ui/states.tsx";
import { ViewportSurface, type ViewportSurfaceProps } from "./viewport-surface.tsx";

// The 3D renderer is heavy, so it loads the first time Play has a world to draw.
const SceneView = lazy(() => import("../../scene/scene-view.tsx"));

export type PlayView = { live: PlayLive | null; onPick: (pick: ScenePick) => void };

// Play mode view: the world as the engine steps it; a click applies the selected Play tool.
export function PlayTab({ play, ...surface }: ViewportSurfaceProps & { play?: PlayView }) {
  const scene = play?.live?.scene;
  const rays = useContext(RayViewContext);
  return (
    <ViewportSurface {...surface}>
      {play?.live && scene ? (
        <div className="absolute inset-0">
          <RenderBoundary
            fallback={(reason) => (
              <ErrorState
                title="The 3D view could not start"
                body="The senses, decisions and events still update."
                detail={reason}
              />
            )}
          >
            <Suspense fallback={null}>
              <SceneView
                mode="play"
                description={scene}
                poses={play.live.poses}
                onPick={play.onPick}
                signals={[play.live.signals]}
                rays={rays?.shown ? play.live.rays : undefined}
                rayValues={rays?.values}
              />
            </Suspense>
          </RenderBoundary>
        </div>
      ) : null}
    </ViewportSurface>
  );
}
