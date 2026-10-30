import { Act } from "../../app/navigation/go-to.tsx";
import { formatPropertyValue } from "../../ports/property-format.ts";
import type { Property, PropertyValue } from "../../ports/scene-port.ts";
import { type PanelRoutes, PropertyControl } from "./controls/property-control.tsx";
import { useScrub } from "./use-scrub.ts";

export type PropertyRowProps = {
  property: Property;
  onChange: (value: PropertyValue) => void;
  onReset: () => void;
  onAccept: () => void;
  panelRoutes?: PanelRoutes;
  // Width of the control column: 150 px in panels, 160 px on wide boards.
  wide?: boolean;
};

const DOT: Partial<Record<Property["state"], string>> = {
  changed: "bg-fg",
  proposed: "bg-proposal",
  "out-of-range": "bg-danger-graphic",
};

// One property: label (drag it to scrub numbers), its control and the line its state adds underneath.
export function PropertyRow({ property, onChange, onReset, onAccept, panelRoutes, wide = false }: PropertyRowProps) {
  const scrub = useScrub(property, onChange);
  const dot = DOT[property.state];
  return (
    <div
      title={property.hint}
      className={`grid items-center gap-x-2 gap-y-0.5 px-3 text-ui ${
        wide ? "grid-cols-[minmax(0,1fr)_160px] py-0.75" : "grid-cols-[minmax(0,1fr)_150px] py-1"
      }`}
    >
      <span
        {...scrub}
        className={`flex min-w-0 items-center gap-1.5 text-fg-secondary ${scrub.onPointerDown ? "cursor-ew-resize" : ""}`}
      >
        {dot ? <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot}`} /> : null}
        <span className="truncate">{property.label}</span>
      </span>
      <PropertyControl property={property} onChange={onChange} panelRoutes={panelRoutes} />
      <StateLine property={property} onReset={onReset} onAccept={onAccept} />
    </div>
  );
}

function StateLine({ property, onReset, onAccept }: Pick<PropertyRowProps, "property" | "onReset" | "onAccept">) {
  switch (property.state) {
    case "changed":
      return (
        <span className="col-start-2 flex justify-between text-meta text-fg-tertiary">
          <span>was {property.was}</span>
          <Act cta={`Reset ${property.label}`} onClick={onReset} className="underline hover:text-fg">
            Reset
          </Act>
        </span>
      );
    case "proposed":
      return (
        <span className="col-start-2 flex justify-between text-meta text-fg-tertiary">
          <span>now {formatPropertyValue(property)}</span>
          <Act cta={`Accept ${property.label}`} onClick={onAccept} className="text-proposal underline hover:text-fg">
            Accept
          </Act>
        </span>
      );
    case "out-of-range":
      return property.note ? <span className="col-start-2 text-meta text-danger">{property.note}</span> : null;
    case "default":
    case "mixed":
    case "locked":
      return null;
  }
}
