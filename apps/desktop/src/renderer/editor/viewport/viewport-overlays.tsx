import { Eye } from "lucide-react";
import type { ReactNode } from "react";

// Building blocks that float over the 3D view (style guide: "Banners and cards over the viewport").

export function OverlayTop({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">{children}</div>;
}

export function OverlayBottomLeft({ children }: { children: ReactNode }) {
  return <div className="absolute bottom-4 left-4">{children}</div>;
}

export function OverlayBottomRight({ children }: { children: ReactNode }) {
  return <div className="absolute right-4 bottom-4">{children}</div>;
}

// What the engine is doing right now, with a spinner ring.
export function ActivityPill({ text }: { text: string }) {
  return (
    <div role="status" className="mt-2.5 flex items-center gap-2 rounded-full bg-overlay px-3.5 py-2 text-ui">
      <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-fg border-r-transparent" />
      {text}
    </div>
  );
}

// Shown whenever the view previews something that is not applied yet.
export function PreviewPill({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-overlay px-3.5 py-2 text-ui text-proposal">
      <Eye size={14} strokeWidth={1.75} aria-hidden />
      {text}
    </div>
  );
}
