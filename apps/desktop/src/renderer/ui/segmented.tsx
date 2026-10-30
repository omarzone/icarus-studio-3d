import type { RouteId } from "../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../app/navigation/go-to.tsx";
import type { RouteParams } from "../app/navigation/navigation-store.tsx";

export type SegmentedItem = {
  label: string;
  active: boolean;
  // Leads to another surface instead of switching in place.
  to?: RouteId;
  params?: RouteParams;
  onSelect?: () => void;
};

const itemClass = (active: boolean) =>
  active
    ? "rounded-control bg-selected px-3.5 py-1.25 text-ui font-semibold text-on-selected"
    : "rounded-control px-3.5 py-1.25 text-ui text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80";

// Segmented control from the style guide: track bg.control, 3 px padding, active item white.
export function Segmented({ items, className = "" }: { items: readonly SegmentedItem[]; className?: string }) {
  return (
    <div className={`flex gap-0.5 rounded-button bg-control p-[3px] ${className}`}>
      {items.map((item) =>
        item.to ? (
          <GoTo
            key={item.label}
            to={item.to}
            cta={item.label}
            params={item.params}
            aria-current={item.active ? "true" : undefined}
            className={itemClass(item.active)}
          >
            {item.label}
          </GoTo>
        ) : (
          <Act
            key={item.label}
            cta={item.label}
            aria-current={item.active ? "true" : undefined}
            onClick={item.onSelect}
            className={itemClass(item.active)}
          >
            {item.label}
          </Act>
        ),
      )}
    </div>
  );
}
