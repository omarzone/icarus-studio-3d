// MOD-BRAIN-SOURCE
import { useQuery } from "@tanstack/react-query";
import { Brain } from "lucide-react";
import { useState } from "react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type BrainSourceOption, brainPort } from "../../ports/brain-port.ts";
import { ActionButton } from "../../ui/action-button.tsx";
import { ChoiceCard } from "../../ui/choice-card.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { dialogButtonClass } from "../../ui/dialog-button.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { StatusPill } from "../../ui/status-pill.tsx";
import { CheckLine } from "../copilot/chat-messages.tsx";

const BRAIN = "fruit-fly";

// Choose what drives the body: learn a new brain, load a connectome or start from a community brain.
export function SourceDialog() {
  const port = usePort(brainPort);
  const query = useQuery({ queryKey: ["brain", BRAIN, "source"], queryFn: () => port.getSource(BRAIN) });
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? query.data?.selected ?? null;
  return (
    <Dialog
      title={query.data?.title ?? "Choose the brain"}
      width="w-155"
      closeTo="SCR-HOME"
      footer={
        <>
          <GoTo to="SCR-HOME" cta="Cancel" className={dialogButtonClass("secondary")}>
            Cancel
          </GoTo>
          <ActionButton
            cta="Load into the fly"
            to="STA-BRAIN-CONNECTOME"
            disabled={selected === null}
            title={selected === null ? "Choose what drives the body first" : undefined}
            run={() => port.loadSource({ brain: BRAIN, id: selected ?? "" })}
            className={dialogButtonClass("primary")}
          >
            Load into the fly
          </ActionButton>
        </>
      }
    >
      <QueryView query={query}>
        {(source) => (
          <>
            <p className="-mt-1 text-body text-fg-secondary">{source.intro}</p>
            <div role="radiogroup" aria-label="What drives the body" className="flex flex-col gap-4">
              {source.options.map((option) => (
                <ChoiceCard
                  key={option.id}
                  title={option.title}
                  detail={option.detail}
                  checked={option.id === selected}
                  onSelect={() => setPicked(option.id)}
                >
                  {option.id === selected && option.dataset ? <Dataset dataset={option.dataset} /> : null}
                </ChoiceCard>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-[14px] bg-control px-3.5 py-3">
              <span className="font-semibold">How it connects</span>
              {source.connections.map((item) => (
                <CheckLine key={item.text} item={item} />
              ))}
            </div>
          </>
        )}
      </QueryView>
    </Dialog>
  );
}

function Dataset({ dataset }: { dataset: NonNullable<BrainSourceOption["dataset"]> }) {
  return (
    <span className="mt-2 flex items-center gap-2.5 rounded-card-sm bg-control-raised px-3 py-2.5">
      <Brain size={18} strokeWidth={1.75} aria-hidden />
      <span className="flex flex-1 flex-col">
        <span className="font-semibold">{dataset.name}</span>
        <span className="text-meta text-fg-secondary">{dataset.facts}</span>
      </span>
      <StatusPill tone="ok">{dataset.fit}</StatusPill>
    </span>
  );
}
