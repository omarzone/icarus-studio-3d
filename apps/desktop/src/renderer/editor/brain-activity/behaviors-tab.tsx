// TAB-BEHAVIORS
import { useQuery } from "@tanstack/react-query";
import { Act } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { brainPort } from "../../ports/brain-port.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";

// Behaviors observed so far, with when they happened; each jumps to its moment.
export function BehaviorsTab({ brain }: { brain: string }) {
  const port = usePort(brainPort);
  const query = useQuery({ queryKey: ["brain", brain, "behaviors"], queryFn: () => port.getBehaviors(brain) });
  return (
    <QueryView
      query={query}
      isEmpty={(data) => data.length === 0}
      empty={<EmptyState title="Nothing observed yet" body="Behaviors appear here as the body moves." />}
    >
      {(behaviors) => (
        <div className="grid grid-cols-3 gap-2.5 px-3 pt-2.5 pb-3">
          {behaviors.map((behavior) => (
            <Act
              key={behavior.id}
              cta={behavior.name}
              title="Jump to this moment"
              className="flex flex-col items-start gap-1 rounded-card-sm bg-control px-3 py-2.5 text-left hover:bg-control-raised active:opacity-80"
            >
              <span className="flex w-full gap-2">
                <span className="font-semibold">{behavior.name}</span>
                <span className="ml-auto font-mono text-ui text-fg-tertiary">{behavior.when}</span>
              </span>
              <span className="text-ui text-fg-secondary">{behavior.detail}</span>
            </Act>
          ))}
        </div>
      )}
    </QueryView>
  );
}
