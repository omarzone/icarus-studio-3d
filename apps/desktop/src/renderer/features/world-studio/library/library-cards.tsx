import { Upload } from "lucide-react";
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";
import type { LibraryItem, LibraryPort } from "../../../ports/library-port.ts";
import { SceneThumbnail } from "../../../scene/scene-thumbnail.tsx";

type Props = {
  items: readonly LibraryItem[];
  onPreview: (id: string) => void;
  // Label of the dashed import card (→ MOD-IMPORT); omitted on shelves you cannot import into.
  importLabel?: string;
  // Draws each card's piece; without it the thumbnail area stays plain.
  scene?: LibraryPort["itemScene"];
};

// Narrowest a card gets; more cards wrap onto new rows instead of the panel scrolling sideways.
const CARD_MIN = "6.5rem";
// A card keeps a readable thumbnail however short the docked panel is.
const CARD_HEIGHT = "7.5rem";

function cardTitle(item: LibraryItem): string {
  if (item.kind === "body") {
    return `Add ${item.name} as the agent, in place of the current body`;
  }
  return item.source ? `${item.name} · by ${item.source}` : item.name;
}

// Piece cards that wrap to the panel's width: 3D thumbnail surface on top, name below, the dashed import card last.
export function LibraryCards({ items, onPreview, importLabel, scene = null }: Props) {
  return (
    <div
      className="grid h-full content-start gap-2 overflow-x-hidden overflow-y-auto px-3 pt-2.5 pb-3"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN}, 1fr))`,
        gridAutoRows: CARD_HEIGHT,
      }}
    >
      {items.map((item) => (
        <Act
          key={item.id}
          cta={item.name}
          title={cardTitle(item)}
          onClick={() => onPreview(item.id)}
          className="group flex min-h-0 flex-col overflow-hidden rounded-card-sm bg-control text-left hover:bg-control-raised"
        >
          {scene ? (
            <SceneThumbnail
              cacheKey={`${item.kind === "body" ? "body" : "piece"}:${item.id}`}
              load={() => scene(item.id)}
              className="min-h-0 w-full flex-1"
            />
          ) : (
            <span aria-hidden className="min-h-0 w-full flex-1 bg-panel" />
          )}
          <span className="flex items-center gap-1.5 px-2.25 py-1.75">
            <span className="min-w-0 flex-1 truncate text-meta font-medium">{item.name}</span>
            {item.kind === "body" ? (
              <span className="shrink-0 rounded-control bg-selected px-1.5 text-meta font-semibold text-on-selected group-hover:opacity-90 group-active:opacity-80">
                Add
              </span>
            ) : null}
          </span>
        </Act>
      ))}
      {importLabel ? (
        <GoTo
          to="MOD-IMPORT"
          cta={importLabel}
          className="flex flex-col items-center justify-center gap-1.5 rounded-card-sm border-[1.5px] border-dashed border-line-dashed px-2 text-center text-meta text-fg-secondary hover:bg-fill-hover hover:text-fg"
        >
          <Upload size={20} strokeWidth={1.75} aria-hidden />
          {importLabel}
        </GoTo>
      ) : null}
    </div>
  );
}
