// TAB-WIRING
import { useQuery } from "@tanstack/react-query";
import { Act } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { brainPort } from "../../ports/brain-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";

// How sensory and motor neurons connect to the body, and how many still have nothing to drive.
export function WiringTab({ brain }: { brain: string }) {
  const port = usePort(brainPort);
  const query = useQuery({ queryKey: ["brain", brain, "wiring"], queryFn: () => port.getWiring(brain) });
  return (
    <QueryView
      query={query}
      isEmpty={(data) => data.maps.length === 0}
      empty={<EmptyState title="No wiring" body="This brain is trained, so it has no neuron map to the body." />}
    >
      {(wiring) => (
        <div className="grid grid-cols-3 gap-2.5 px-3 pt-2.5 pb-3">
          {wiring.maps.map((map) => (
            <div key={map.id} className="flex flex-col gap-1 rounded-card-sm bg-control px-3 py-2.5">
              <span className="flex gap-2">
                <span className="font-semibold">{map.name}</span>
                <span className="ml-auto font-mono text-ui">{map.matched}</span>
              </span>
              <span className="text-ui text-fg-secondary">{map.detail}</span>
            </div>
          ))}
          {wiring.unmatched > 0 ? (
            <div className="flex flex-col items-start gap-1.5 rounded-card-sm bg-control px-3 py-2.5">
              <span className="font-semibold text-warn">{wiring.unmatched}% unmatched</span>
              <Act cta="Fix unmatched neurons" className={buttonClass("secondary", "bg-control-raised!")}>
                Fix unmatched neurons
              </Act>
            </div>
          ) : null}
        </div>
      )}
    </QueryView>
  );
}
