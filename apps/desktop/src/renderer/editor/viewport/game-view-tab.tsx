// TAB-GAME-VIEW
import { useSceneDescription } from "../scene-queries.ts";
import { ScenePreview } from "./scene-preview.tsx";
import { ViewportSurface, type ViewportSurfaceProps } from "./viewport-surface.tsx";

// The world as it will look, without editing chrome: orbit around it, nothing to select or move.
export function GameViewTab({ label, tint, overlays, scene }: ViewportSurfaceProps) {
  return (
    <ViewportSurface label={`${label} through the project camera`} tint={tint} overlays={overlays}>
      {scene ? <GameScene scene={scene} /> : null}
    </ViewportSurface>
  );
}

function GameScene({ scene }: { scene: string }) {
  const description = useSceneDescription(scene);
  return description.data ? <ScenePreview description={description.data} /> : null;
}
