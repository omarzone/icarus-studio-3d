import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { Act } from "../app/navigation/go-to.tsx";

type PanelProps = {
  // Catalog module ID (PNL-…), used by the design checks to find the module.
  id: string;
  tabs: ReactNode;
  options?: ReactNode;
  children: ReactNode;
  className?: string;
};

// Panel from the style guide: a 38 px tab bar (grip, tabs, options) over its body.
export function Panel({ id, tabs, options, children, className = "" }: PanelProps) {
  return (
    <section
      data-ui-id={id}
      className={`flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-panel ${className}`}
    >
      <div className="flex h-9.75 shrink-0 items-center gap-0.5 border-b border-line-subtle bg-strip px-2">
        <GripVertical size={14} strokeWidth={1.75} className="shrink-0 text-fg-disabled" aria-hidden />
        <div className="flex min-w-0 items-center gap-0.5">{tabs}</div>
        {options ? <div className="ml-auto flex items-center gap-1">{options}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

type TabProps = { label: string; active?: boolean; onSelect?: () => void };

export const panelTabClass = (active: boolean) =>
  active
    ? "rounded-control bg-control-raised px-2.5 py-1.25 text-ui font-medium text-fg"
    : "rounded-control px-2.5 py-1.25 text-ui text-fg-tertiary hover:bg-fill-hover hover:text-fg";

// A tab inside a panel tab bar. Tabs that open another surface use GoTo with panelTabClass instead.
export function PanelTab({ label, active = false, onSelect }: TabProps) {
  return (
    <Act
      cta={label}
      role="tab"
      aria-selected={active}
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
      className={panelTabClass(active)}
    >
      {label}
    </Act>
  );
}
