// TAB-PROPERTIES
import { Plus } from "lucide-react";
import { useState } from "react";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import type { Inspection, Property, PropertyValue } from "../../ports/scene-port.ts";
import { EmptyState } from "../../ui/states.tsx";
import { SCENE_ICONS } from "../scene-icons.ts";
import type { PanelRoutes } from "./controls/property-control.tsx";
import { InspectorSection } from "./inspector-section.tsx";
import { PropertyRow } from "./property-row.tsx";

export type PropertyTarget = { section: string; property: string };

export type PropertiesTabProps = {
  inspection: Inspection;
  onChange: (target: PropertyTarget, value: PropertyValue) => void;
  onReset: (target: PropertyTarget) => void;
  onAccept: (target: PropertyTarget) => void;
  // Where "+ Add component" leads; it only shows for scene objects.
  addComponentTo?: RouteId;
  panelRoutes?: PanelRoutes;
  // Board layout: object header with an icon tile, 160 px controls and a primary Add component button.
  board?: boolean;
};

export function PropertiesTab(props: PropertiesTabProps) {
  const { inspection } = props;
  switch (inspection.kind) {
    case "nothing":
      return <EmptyState title="Nothing selected" body="Select something in the explorer or the 3D view to edit it." />;
    case "building":
      return <Building />;
    case "object":
      return <ObjectProperties {...props} inspection={inspection} />;
  }
}

function ObjectProperties({
  inspection,
  onChange,
  onReset,
  onAccept,
  addComponentTo,
  panelRoutes,
  board = false,
}: PropertiesTabProps & { inspection: Extract<Inspection, { kind: "object" }> }) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const matches = (property: Property) => !query || property.label.toLowerCase().includes(query);
  const Icon = inspection.icon ? SCENE_ICONS[inspection.icon] : null;
  return (
    <div className="flex flex-col">
      {board ? (
        <div className="flex items-center gap-2.5 p-3">
          <span className="grid size-9 place-items-center rounded-button bg-control">
            {Icon ? <Icon size={18} strokeWidth={1.75} aria-hidden /> : null}
          </span>
          <span className="flex flex-col">
            <span className="text-body font-semibold">{inspection.title}</span>
            <span className="text-meta text-fg-tertiary">{inspection.subtitle}</span>
          </span>
        </div>
      ) : (
        <>
          <Heading title={inspection.title} subtitle={inspection.subtitle} />
          <Filter value={filter} onChange={setFilter} />
        </>
      )}
      {inspection.sections.map((section) => {
        const properties = section.properties.filter(matches);
        if (query && properties.length === 0) {
          return null;
        }
        return (
          <InspectorSection key={section.id} section={section} component={Boolean(section.icon)}>
            {properties.map((property) => {
              const target = { section: section.id, property: property.id };
              return (
                <PropertyRow
                  key={property.id}
                  property={property}
                  wide={board}
                  panelRoutes={panelRoutes}
                  onChange={(value) => onChange(target, value)}
                  onReset={() => onReset(target)}
                  onAccept={() => onAccept(target)}
                />
              );
            })}
          </InspectorSection>
        );
      })}
      {inspection.components && addComponentTo ? <AddComponent to={addComponentTo} board={board} /> : null}
    </div>
  );
}

function Building() {
  const [filter, setFilter] = useState("");
  return (
    <div className="flex flex-col">
      <Heading title="Building…" subtitle="Icarus is creating your project" />
      <Filter value={filter} onChange={setFilter} />
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-px px-3 pt-2.5 pb-1">
      <span className="text-body leading-4 font-semibold">{title}</span>
      <span className="text-meta text-fg-tertiary">{subtitle}</span>
    </div>
  );
}

function Filter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="px-3 py-1.5">
      <input
        type="search"
        aria-label="Filter properties"
        placeholder="Filter properties…"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-7 w-full rounded-control bg-control px-2.5 text-ui outline-none placeholder:text-fg-tertiary hover:bg-control-raised focus:bg-control-raised"
      />
    </div>
  );
}

function AddComponent({ to, board }: { to: RouteId; board: boolean }) {
  const className = board
    ? "flex h-8 w-full items-center justify-center gap-1.5 rounded-button bg-selected text-ui font-semibold text-on-selected hover:opacity-90"
    : "flex h-7.5 w-full items-center justify-center rounded-button border-[1.5px] border-dashed border-line-dashed text-ui text-fg-secondary hover:bg-fill-hover hover:text-fg";
  return (
    <div className="p-3">
      {board ? (
        <Act cta="Add component" className={className}>
          <Plus size={13} strokeWidth={1.75} aria-hidden />
          Add component
        </Act>
      ) : (
        <GoTo to={to} cta="+ Add component" className={className}>
          + Add component
        </GoTo>
      )}
    </div>
  );
}
