// TAB-MATCH-SCORE
import { useQuery } from "@tanstack/react-query";
import { usePort } from "../../../app/runtime/port.tsx";
import { motionPort } from "../../../ports/motion-port.ts";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";

const WEAK = 0.7;

// Match per body part, weak parts in amber.
export function MatchScoreTab({ clip }: { clip: string }) {
  const port = usePort(motionPort);
  const query = useQuery({ queryKey: ["motion", clip, "parts"], queryFn: () => port.getPartMatch(clip) });
  return (
    <QueryView
      query={query}
      isEmpty={(data) => data.length === 0}
      empty={<EmptyState title="No match yet" body="The match per body part appears once the copy has trained." />}
    >
      {(parts) => (
        <div className="grid grid-cols-[160px_minmax(0,1fr)_44px] items-center gap-x-3 gap-y-2 px-3 pt-3 pb-3 text-ui">
          {parts.map((part) => (
            <PartRow key={part.id} name={part.name} match={part.match} />
          ))}
        </div>
      )}
    </QueryView>
  );
}

function PartRow({ name, match }: { name: string; match: number }) {
  const weak = match < WEAK;
  return (
    <>
      <span className={weak ? "text-warn" : ""}>{name}</span>
      <span className="h-1.5 rounded-bar bg-control-raised">
        <span
          className={`block h-1.5 rounded-bar ${weak ? "bg-warn" : "bg-fg"}`}
          style={{ width: `${match * 100}%` }}
        />
      </span>
      <span className="text-right font-mono">{Math.round(match * 100)}%</span>
    </>
  );
}
