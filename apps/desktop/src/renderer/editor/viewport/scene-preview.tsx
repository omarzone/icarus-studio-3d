import type { SceneDescription } from "@icarus/contracts";
import { lazy, Suspense } from "react";
import { RenderBoundary } from "../../ui/render-boundary.tsx";

const SceneView = lazy(() => import("../../scene/scene-view.tsx"));

const ignore = () => undefined;

// A compiled scene drawn to look at (an idea before it is built): orbit only, nothing to select or move.
export function ScenePreview({ description }: { description: SceneDescription }) {
  return (
    <div className="absolute inset-0">
      <RenderBoundary
        fallback={(reason) => (
          <p className="p-3 text-meta text-fg-tertiary">The 3D preview could not start: {reason}</p>
        )}
      >
        <Suspense fallback={null}>
          <SceneView description={description} selected={null} onSelect={ignore} onMove={ignore} viewCube={false} />
        </Suspense>
      </RenderBoundary>
    </div>
  );
}
