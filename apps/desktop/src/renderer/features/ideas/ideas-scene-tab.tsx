// TAB-IDEAS-SCENE
import { ViewportSurface } from "../../editor/viewport/viewport-surface.tsx";

// The highlighted idea in the full 3D view.
export function IdeasSceneTab({ title }: { title: string }) {
  return <ViewportSurface label={`Preview of ${title}`} />;
}
