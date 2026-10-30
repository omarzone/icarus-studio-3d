// TAB-BEHAVIOR-TESTS
import { Check, CircleDashed, TriangleAlert } from "lucide-react";
import { Act } from "../../../app/navigation/go-to.tsx";
import type { ReferenceTestState, ReferenceTests } from "../../../ports/results-port.ts";

function StateMark({ state }: { state: ReferenceTestState }) {
  switch (state) {
    case "pass":
      return <Check size={13} strokeWidth={1.75} className="shrink-0 text-ok" aria-label="Within range" />;
    case "warn":
      return <TriangleAlert size={13} strokeWidth={1.75} className="shrink-0 text-warn" aria-label="Off" />;
    case "not-run":
      return <CircleDashed size={13} strokeWidth={1.75} className="shrink-0 text-fg-tertiary" aria-label="Not run" />;
  }
}

// Tests against recorded real behavior, with pass, warning or not run.
export function BehaviorTestsTab({ tests, onSelect }: { tests: ReferenceTests; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {tests.tests.map((test) => {
        const selected = test.id === tests.selected;
        return (
          <Act
            key={test.id}
            cta={test.name}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(test.id)}
            className={`flex items-center gap-2.5 rounded-button px-2.5 py-2.25 text-left leading-4 ${
              selected ? "bg-control-raised" : "hover:bg-fill-hover"
            }`}
          >
            <StateMark state={test.state} />
            <span className="flex-1">{test.name}</span>
            {test.state === "not-run" ? <span className="text-meta text-fg-tertiary">not run</span> : null}
          </Act>
        );
      })}
    </div>
  );
}
