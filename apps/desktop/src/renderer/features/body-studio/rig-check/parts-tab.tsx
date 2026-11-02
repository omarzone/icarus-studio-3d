// TAB-BODY-PARTS
import { useQuery } from "@tanstack/react-query";
import { usePort } from "../../../app/runtime/port.tsx";
import { type BodyParts, bodyPort } from "../../../ports/body-port.ts";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";

// Joints with their range and motor, and the senses each body carries, read from the project document.
export function PartsTab({ body }: { body: string }) {
  const port = usePort(bodyPort);
  const query = useQuery({ queryKey: ["body", body, "parts"], queryFn: () => port.getParts(body) });
  return (
    <QueryView
      query={query}
      isEmpty={(data) => data.length === 0}
      empty={<EmptyState title="No body yet" body="Ask the copilot for a body or start from a template." />}
    >
      {(bodies) => (
        <div className="flex h-full flex-col gap-2.5 overflow-y-auto px-3 pt-2.5 pb-3">
          {bodies.map((item) => (
            <BodySummary key={item.id} body={item} />
          ))}
        </div>
      )}
    </QueryView>
  );
}

function BodySummary({ body }: { body: BodyParts }) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
      <div className="flex flex-col gap-1.5 rounded-card-sm bg-control p-3 text-ui">
        <span className="leading-4 font-semibold">
          {body.name} · {body.parts} parts · {body.joints.length} joints
        </span>
        {body.joints.length === 0 ? <span className="text-fg-secondary">No joints</span> : null}
        {body.joints.map((joint) => (
          <div key={joint.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5">
            <span className="truncate">{joint.part}</span>
            <span className="font-mono text-fg-secondary">
              {joint.kind} {joint.range}
            </span>
            <span className={`font-mono ${joint.motor ? "" : "text-fg-tertiary"}`}>{joint.motor ?? "no motor"}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 rounded-card-sm bg-control p-3 text-ui">
        <span className="leading-4 font-semibold">Senses</span>
        {body.sensors.length === 0 ? <span className="text-fg-secondary">No senses</span> : null}
        {body.sensors.map((sensor) => (
          <div key={sensor.id} className="flex justify-between gap-2.5">
            <span className="truncate">{sensor.part}</span>
            <span className="text-fg-secondary">{sensor.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
