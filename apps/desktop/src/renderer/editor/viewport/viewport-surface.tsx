import type { ReactNode } from "react";

export type ViewportSurfaceProps = {
  // What the view shows, for assistive technology; the 3D renderer draws inside this surface.
  label: string;
  // Tints the view while it previews a change that is not applied yet.
  tint?: "proposal";
  overlays?: ReactNode;
};

// The 3D area: a plain surface until the scene renderer draws engine states into it. Never draws a fake scene.
export function ViewportSurface({ label, tint, overlays }: ViewportSurfaceProps) {
  return (
    <div role="img" aria-label={label} className="relative min-h-0 flex-1 bg-panel">
      {tint === "proposal" ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-proposal-tint" />
      ) : null}
      {overlays}
    </div>
  );
}
