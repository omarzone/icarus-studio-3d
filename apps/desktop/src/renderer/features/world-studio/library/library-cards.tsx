import { Upload } from "lucide-react";
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";
import type { LibraryItem } from "../../../ports/library-port.ts";

type Props = {
  items: readonly LibraryItem[];
  onPreview: (id: string) => void;
  // Label of the dashed import card (→ MOD-IMPORT); omitted on shelves you cannot import into.
  importLabel?: string;
};

// A row of piece cards: 3D thumbnail surface on top, name below, the dashed import card last.
export function LibraryCards({ items, onPreview, importLabel }: Props) {
  const columns = items.length + (importLabel ? 1 : 0);
  return (
    <div
      className="grid h-full gap-2 px-3 pt-2.5 pb-3"
      style={{ gridTemplateColumns: `repeat(${Math.max(columns, 5)}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <Act
          key={item.id}
          cta={item.name}
          title={item.source ? `${item.name} · by ${item.source}` : item.name}
          onClick={() => onPreview(item.id)}
          className="flex min-h-0 flex-col overflow-hidden rounded-card-sm bg-control text-left hover:bg-control-raised"
        >
          <span aria-hidden className="min-h-0 w-full flex-1 bg-panel" />
          <span className="truncate px-2.25 py-1.75 text-meta font-medium">{item.name}</span>
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
