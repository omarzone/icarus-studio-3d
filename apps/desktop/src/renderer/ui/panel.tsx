import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Act } from "../app/navigation/go-to.tsx";
import { useDockedPanel, useDockSlot } from "./dock-slot.ts";

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
  const docked = useDockedPanel();
  if (docked) {
    return (
      <DockedPanelBody id={id} docked={docked} tabs={tabs} options={options}>
        {children}
      </DockedPanelBody>
    );
  }
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

type DockedProps = Omit<PanelProps, "className"> & { docked: { id: string } };

// Inside a dock group the tab bar belongs to the dock: the panel's tabs and options are drawn into it.
function DockedPanelBody({ id, docked, tabs, options, children }: DockedProps) {
  const tabsSlot = useDockSlot("tabs", docked.id);
  const optionsSlot = useDockSlot("options", docked.id);
  return (
    <section data-ui-id={id} className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      {tabsSlot ? createPortal(tabs, tabsSlot) : null}
      {options && optionsSlot
        ? createPortal(<div className="flex items-center gap-1">{options}</div>, optionsSlot)
        : null}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

type TabProps = { label: string; active?: boolean; onSelect?: () => void };

export const panelTabClass = (active: boolean) =>
  active
    ? "min-w-0 truncate rounded-control bg-control-raised px-2.5 py-1.25 text-ui font-medium text-fg"
    : "min-w-0 truncate rounded-control px-2.5 py-1.25 text-ui text-fg-tertiary hover:bg-fill-hover hover:text-fg";

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
