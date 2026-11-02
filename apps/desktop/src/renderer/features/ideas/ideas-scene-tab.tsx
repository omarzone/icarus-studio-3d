// TAB-IDEAS-SCENE
import { ScenePreview } from "../../editor/viewport/scene-preview.tsx";
import { ViewportSurface } from "../../editor/viewport/viewport-surface.tsx";
import type { Idea } from "../../ports/ideas-port.ts";

// The highlighted idea in the full 3D view.
export function IdeasSceneTab({ idea }: { idea: Idea | undefined }) {
  return (
    <ViewportSurface label={`Preview of ${idea?.title ?? ""}`}>
      {idea?.scene ? <ScenePreview description={idea.scene} /> : null}
    </ViewportSurface>
  );
}
