import { useState } from "react";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import type { Inspection, Property, PropertyValue } from "../../ports/scene-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { EmptyState } from "../../ui/states.tsx";
import type { ColorCompanion, PanelRoutes } from "./controls/property-control.tsx";
import { InspectorSection } from "./inspector-section.tsx";
import { PropertyRow } from "./property-row.tsx";

export type PropertyTarget = { section: string; property: string };

export type PropertiesTabProps = {
  inspection: Inspection;
  onChange: (target: PropertyTarget, value: PropertyValue) => void;
  onReset: (target: PropertyTarget) => void;
  onAccept: (target: PropertyTarget) => void;
  // Removes a component section from the selected object.
  onRemove?: (section: string) => void;
  // Turns the selected endless floor plane into a ground slab (offered only for one).
  onMakeSlab?: () => void;
  // Where "+ Add component" leads; it only shows for scene objects.
  addComponentTo?: RouteId;
  // Scene key the new component goes to, passed to the picker as the `addTo` route parameter.
  scene?: string;
  panelRoutes?: PanelRoutes;
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
  onRemove,
  onMakeSlab,
  addComponentTo,
  scene,
  panelRoutes,
}: PropertiesTabProps & { inspection: Extract<Inspection, { kind: "object" }> }) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const matches = (property: Property) => !query || property.label.toLowerCase().includes(query);
  return (
    <div className="flex flex-col">
      <Heading title={inspection.title} subtitle={inspection.subtitle} />
      {inspection.planeFloor && onMakeSlab ? <SlabOffer onMakeSlab={onMakeSlab} /> : null}
      <Filter value={filter} onChange={setFilter} />
      {inspection.sections.map((section) => {
        const properties = section.properties.filter(matches);
        if (query && properties.length === 0) {
          return null;
        }
        return (
          <InspectorSection
            key={section.id}
            section={section}
            component={Boolean(section.icon)}
            onRemove={onRemove && inspection.components ? () => onRemove(section.id) : undefined}
          >
            {properties.map((property) => {
              const target = { section: section.id, property: property.id };
              return (
                <PropertyRow
                  key={property.id}
                  property={property}
                  companion={paletteColor(section.properties, property, (value) =>
                    onChange({ section: section.id, property: "color" }, value),
                  )}
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
      {inspection.components && addComponentTo ? <AddComponent to={addComponentTo} scene={scene} /> : null}
    </div>
  );
}

// A palette list carries its section's color, so the palette popover can tint its swatches and pick the color.
function paletteColor(
  properties: readonly Property[],
  property: Property,
  onChange: (value: PropertyValue) => void,
): ColorCompanion | undefined {
  const color = properties.find((item) => item.id === "color");
  if (property.id !== "preset" || property.type !== "list" || color?.type !== "color") {
    return undefined;
  }
  return { value: color.value, onChange: (hex) => onChange({ type: "color", value: hex }) };
}

function SlabOffer({ onMakeSlab }: { onMakeSlab: () => void }) {
  return (
    <div className="mx-3 my-1.5 flex flex-col gap-1.5 rounded-card bg-control p-2.5">
      <span className="text-ui text-fg-secondary">
        This floor is an endless plane. As a slab it gets edges, a thickness and a size, and bodies can fall off it.
      </span>
      <Act cta="Make it a slab" onClick={onMakeSlab} className={buttonClass("secondary", "self-start")}>
        Make it a slab
      </Act>
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

function AddComponent({ to, scene }: { to: RouteId; scene: string | undefined }) {
  const params = useNavigation((state) => state.params);
  return (
    <div className="p-3">
      <GoTo
        to={to}
        cta="+ Add component"
        params={scene ? { ...params, addTo: scene } : params}
        className="flex h-7.5 w-full items-center justify-center rounded-button border-[1.5px] border-dashed border-line-dashed text-ui text-fg-secondary hover:bg-fill-hover hover:text-fg"
      >
        + Add component
      </GoTo>
    </div>
  );
}
