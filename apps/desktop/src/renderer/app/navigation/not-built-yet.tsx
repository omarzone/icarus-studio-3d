import { ArrowLeft } from "lucide-react";
import type { RouteId } from "./catalog-id.ts";
import { useNavigation } from "./navigation-store.tsx";

// Drawn for a catalog ID that has no screen yet, so a flow never dead-ends on a blank window.
export function NotBuiltYet({ id }: { id: RouteId }) {
  const back = useNavigation((state) => state.back);
  return (
    <div className="absolute inset-0 grid place-items-center bg-scrim-modal">
      <div className="flex w-105 flex-col gap-3 rounded-dialog border border-line-strong bg-panel p-5.5 shadow-dialog">
        <p className="text-title-3 font-semibold">This screen is not built yet</p>
        <p className="font-mono text-meta text-fg-tertiary">{id}</p>
        <button
          type="button"
          data-cta="go-back"
          onClick={back}
          className="flex h-8 items-center gap-1.5 self-end rounded-button bg-control px-3.5 text-ui hover:bg-control-raised active:opacity-80"
        >
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
          Go back
        </button>
      </div>
    </div>
  );
}
