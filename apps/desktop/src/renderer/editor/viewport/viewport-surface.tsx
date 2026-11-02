import type { SceneGeom } from "@icarus/contracts";
import { lazy, type ReactNode, Suspense, useContext } from "react";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { scenePort } from "../../ports/scene-port.ts";
import { RayViewContext } from "../../scene/ray-lines.ts";
import { RenderBoundary } from "../../ui/render-boundary.tsx";
import { ErrorState } from "../../ui/states.tsx";
import { useSceneCache, useSceneDescription, useSceneTree } from "../scene-queries.ts";
import { CopiesPreview } from "./copies-preview.tsx";

// The 3D renderer is heavy, so it loads the first time a view has a scene to draw.
const SceneView = lazy(() => import("../../scene/scene-view.tsx"));

export type ViewportSurfaceProps = {
  // What the view shows, for assistive technology; the 3D renderer draws inside this surface.
  label: string;
  // Tints the view while it previews a change that is not applied yet.
  tint?: "proposal";
  overlays?: ReactNode;
  scene?: string;
  // Geoms of a copilot proposal drawn over the scene before it is applied.
  ghosts?: readonly SceneGeom[];
  // A 3D view drawn instead of the project scene (the live world in Play).
  children?: ReactNode;
  // Shows the scene's training copies side by side instead of the editable scene, until `onExit`.
  copiesPreview?: { onExit: () => void };
};

// The 3D area: it draws the engine's compiled scene when there is one, and never a fake scene.
export function ViewportSurface({
  label,
  tint,
  overlays,
  scene,
  ghosts,
  children,
  copiesPreview,
}: ViewportSurfaceProps) {
  return (
    <div role="img" aria-label={label} className="relative min-h-0 flex-1 bg-panel">
      {scene && copiesPreview ? <CopiesPreview scene={scene} onExit={copiesPreview.onExit} /> : null}
      {scene && !copiesPreview ? <EngineScene scene={scene} ghosts={ghosts} /> : null}
      {children}
      {tint === "proposal" ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-proposal-tint" />
      ) : null}
      {overlays}
    </div>
  );
}

function EngineScene({ scene, ghosts }: { scene: string; ghosts?: readonly SceneGeom[] }) {
  const port = usePort(scenePort);
  const description = useSceneDescription(scene);
  const tree = useSceneTree(scene);
  const cache = useSceneCache(scene);
  const select = useEngineAction(port.selectObject);
  const move = useEngineAction(port.moveObject);
  const rays = useContext(RayViewContext);
  if (!description.data) {
    return null;
  }
  return (
    <div className="absolute inset-0">
      <RenderBoundary
        fallback={(reason) => (
          <ErrorState
            title="The 3D view could not start"
            body="The explorer and inspector still work."
            detail={reason}
          />
        )}
      >
        <Suspense fallback={null}>
          <SceneView
            key={scene}
            description={description.data}
            ghosts={ghosts}
            rays={rays?.shown ? description.data.rays : undefined}
            rayValues={rays?.values}
            selected={tree.data?.selected ?? null}
            onSelect={(id) => {
              if (id) {
                select.mutate({ scene, id }, { onSuccess: cache.tree });
              }
            }}
            onMove={(id, delta) => move.mutate({ scene, id, delta }, { onSuccess: cache.inspection })}
          />
        </Suspense>
      </RenderBoundary>
    </div>
  );
}
