// TAB-SCENE
import { ViewportSurface, type ViewportSurfaceProps } from "./viewport-surface.tsx";

// Editable 3D view of the world; gizmos, selection outlines and copilot ghosts arrive with the renderer.
export function SceneTab(props: ViewportSurfaceProps) {
  return <ViewportSurface {...props} />;
}
