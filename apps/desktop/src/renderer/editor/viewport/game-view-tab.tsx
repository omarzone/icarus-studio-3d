// TAB-GAME-VIEW
import { ViewportSurface, type ViewportSurfaceProps } from "./viewport-surface.tsx";

// The world through the project camera, without editing chrome.
export function GameViewTab({ label, tint, overlays }: ViewportSurfaceProps) {
  return <ViewportSurface label={`${label} through the project camera`} tint={tint} overlays={overlays} />;
}
