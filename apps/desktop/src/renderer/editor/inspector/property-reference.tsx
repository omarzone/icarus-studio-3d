// REF-PROPERTY-TYPES
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Eye, Menu, MousePointerClick } from "lucide-react";
import { useState } from "react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type Property, type PropertyValue, scenePort } from "../../ports/scene-port.ts";
import { BoardTitleBar } from "../../ui/board-title-bar.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { sceneKeys } from "../scene-queries.ts";
import { PropertyControl } from "./controls/property-control.tsx";

const PANEL_ROUTES = { "brain-sizes": "MOD-BRAIN-SIZES" } as const;

const INTERACTIONS = [
  {
    icon: MousePointerClick,
    title: "Click",
    body: "Edit in place. Lists and colors open a small picker; big things open their own panel.",
  },
  {
    icon: ArrowLeftRight,
    title: "Drag the name",
    body: "Scrub numbers left or right, like in Blender. Hold Shift for fine steps.",
  },
  { icon: Menu, title: "Right-click", body: "Reset, copy, paste, randomize per copy, or ask the copilot about it." },
  { icon: Eye, title: "Hover", body: "A one-line explanation in plain words, and where it shows in the 3D view." },
] as const;

// Design reference of the inspector: the 12 property types, their 6 states and what touching a property does.
export function PropertyReferenceBoard() {
  const port = usePort(scenePort);
  const reference = useQuery({ queryKey: sceneKeys.reference, queryFn: () => port.getPropertyReference() });
  const [edits, setEdits] = useState<Readonly<Record<string, Property>>>({});
  const live = (property: Property) => edits[property.id] ?? property;
  const edit = (property: Property) => (value: PropertyValue) =>
    setEdits({ ...edits, [property.id]: { ...property, ...value } });
  return (
    <div className="flex h-full flex-col border border-line-strong bg-app text-fg">
      <BoardTitleBar title="Inspector · property types" />
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-7.5 py-5.5">
        <div className="flex items-end gap-5">
          <span className="flex flex-col gap-1.5">
            <h1 className="text-title-1 font-semibold">Every property has one of 12 types</h1>
            <span className="text-body leading-normal text-fg-secondary">
              Built-in or imported, every object uses the same inspector. The type decides the control, so a car, a fly
              or a robot arm always feels the same to edit. Hover any property for a one-line explanation.
            </span>
          </span>
          <GoTo
            to="POP-ADD-COMPONENT"
            cta="See components"
            className={buttonClass("primary", "ml-auto h-8.5! text-body!")}
          >
            See components
          </GoTo>
        </div>
        <QueryView query={reference}>
          {(data) => (
            <>
              <div className="grid grid-cols-4 gap-3">
                {data.types.map((item) => (
                  <div key={item.type} className="flex flex-col gap-2 rounded-card bg-control px-3.5 py-3">
                    <div className="flex items-baseline gap-2 leading-tight">
                      <span className="font-semibold">{item.label}</span>
                      {item.tag ? <span className="ml-auto text-meta text-fg-tertiary">{item.tag}</span> : null}
                    </div>
                    <div className="rounded-button bg-panel p-2.5">
                      <PropertyControl
                        property={live(item.sample)}
                        onChange={edit(item.sample)}
                        panelRoutes={PANEL_ROUTES}
                      />
                    </div>
                    <span className="text-meta leading-normal text-fg-secondary">{item.use}</span>
                  </div>
                ))}
              </div>
              <h2 className="text-headline leading-tight font-semibold">Every type has the same 6 states</h2>
              <div className="flex gap-2.5">
                {data.states.map((item) => (
                  <div
                    key={item.state}
                    className="flex min-w-0 flex-1 flex-col gap-2 rounded-card-sm bg-control px-3 py-2.5"
                  >
                    <span className="text-ui leading-tight font-semibold">{item.label}</span>
                    <div className="rounded-control bg-panel p-2">
                      <PropertyControl property={live(item.sample)} onChange={edit(item.sample)} />
                    </div>
                    <span className="text-meta leading-normal text-fg-secondary">{item.use}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </QueryView>
        <h2 className="text-headline leading-tight font-semibold">What happens when you touch a property</h2>
        <div className="grid grid-cols-4 gap-2.5">
          {INTERACTIONS.map((item) => (
            <div key={item.title} className="flex items-start gap-2.5 rounded-card-sm bg-control px-3.5 py-3">
              <item.icon size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
              <span className="flex flex-col gap-0.75">
                <span className="text-ui font-semibold">{item.title}</span>
                <span className="text-meta leading-normal text-fg-secondary">{item.body}</span>
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
