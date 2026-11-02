import type { SceneDescription } from "@icarus/contracts";
import { ArrowLeft } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { isFirstCopy, scenesGrid } from "../../scene/copy-grid.ts";
import type { Poses } from "../../scene/pose-track.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { RenderBoundary } from "../../ui/render-boundary.tsx";
import { EmptyState, ErrorState } from "../../ui/states.tsx";
import { useCopyScenes } from "../scene-queries.ts";
import { OverlayTop } from "./viewport-overlays.tsx";

const SceneView = lazy(() => import("../../scene/scene-view.tsx"));

const NO_POSES: Poses = new Map();
const ignorePick = () => undefined;

// The training copies side by side, each starting its first episode as training will, instead of the editable scene.
export function CopiesPreview({ scene, onExit }: { scene: string; onExit: () => void }) {
  const copies = useCopyScenes(scene);
  return (
    <div className="absolute inset-0">
      <QueryView
        query={copies}
        errorTitle="The copies could not be shown"
        isEmpty={(scenes) => scenes.length === 0}
        empty={<EmptyState title="No copies to show" body="Set how many copies train in Training copies." />}
      >
        {(scenes) => <CopiesGrid scenes={scenes} />}
      </QueryView>
      <OverlayTop>
        <div className="pointer-events-auto mt-2.5 flex items-center gap-2 rounded-full bg-overlay py-1 pr-1 pl-3.5 text-ui">
          <span role="status">
            {copies.data
              ? `${copies.data.length} training ${copies.data.length === 1 ? "copy" : "copies"} · first try of each`
              : "Training copies"}
          </span>
          <Act cta="Back to the scene" onClick={onExit} className={buttonClass("secondary", "h-7! gap-1.5! px-3!")}>
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Back to the scene
          </Act>
        </div>
      </OverlayTop>
    </div>
  );
}

function CopiesGrid({ scenes }: { scenes: readonly SceneDescription[] }) {
  const grid = useMemo(() => scenesGrid(scenes), [scenes]);
  return (
    <RenderBoundary
      fallback={(reason) => (
        <ErrorState title="The 3D view could not start" body="The explorer and inspector still work." detail={reason} />
      )}
    >
      <Suspense fallback={null}>
        <SceneView
          mode="play"
          description={grid.description}
          poses={NO_POSES}
          onPick={ignorePick}
          framing={grid.extent}
          follows={isFirstCopy}
        />
      </Suspense>
    </RenderBoundary>
  );
}
