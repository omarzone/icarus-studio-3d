// PNL-SENSES-ACTIONS
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Act } from "../../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { brainPort, type SensesActions } from "../../../ports/brain-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { WhatItCanDoTab } from "./what-it-can-do-tab.tsx";
import { WhatItSeesTab } from "./what-it-sees-tab.tsx";

type Tab = "sees" | "can-do";

export function SensesActionsPanel({ brain }: { brain: string }) {
  const port = usePort(brainPort);
  const client = useQueryClient();
  const key = ["brain", brain, "senses"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getSensesActions(brain) });
  const [tab, setTab] = useState<Tab>("sees");
  const update = { onSuccess: (next: SensesActions) => client.setQueryData(key, next) };
  // A sensor change is a new revision of the body: the viewport, inspector and the rest read it again.
  const changed = {
    onSuccess: (next: SensesActions) => {
      client.setQueryData(key, next);
      void client.invalidateQueries({
        predicate: (cached) => !(cached.queryKey[0] === "brain" && cached.queryKey[2] === "senses"),
      });
    },
  };
  const toggleInput = useEngineAction(port.toggleInput);
  const toggleOutput = useEngineAction(port.toggleOutput);
  const addInput = useEngineAction(port.addInput);
  const removeInput = useEngineAction(port.removeInput);
  const renameInput = useEngineAction(port.renameInput);
  return (
    <Panel
      id="PNL-SENSES-ACTIONS"
      className="flex-1"
      tabs={
        <>
          <PanelTab label="What it sees" active={tab === "sees"} onSelect={() => setTab("sees")} />
          <PanelTab label="What it can do" active={tab === "can-do"} onSelect={() => setTab("can-do")} />
        </>
      }
      options={
        <Act
          cta="Add a sensor input"
          aria-label="Add a sensor input"
          title="Add a distance ray to the body and feed its reading to the brain"
          disabled={addInput.isPending}
          onClick={() => addInput.mutate(brain, changed)}
          className="grid h-6 w-5 place-items-center rounded-control text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80 disabled:opacity-35"
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden />
        </Act>
      }
    >
      <QueryView
        query={query}
        isEmpty={(data) => data.inputs.length === 0 && data.outputs.length === 0}
        empty={<EmptyState title="No senses yet" body="Add a sensor to the body, or ask the copilot." />}
      >
        {(data) =>
          tab === "sees" ? (
            <WhatItSeesTab
              inputs={data.inputs}
              onToggle={(id) => toggleInput.mutate({ brain, id }, update)}
              onRename={(id, name) => renameInput.mutate({ brain, id, name }, changed)}
              onRemove={(id) => removeInput.mutate({ brain, id }, changed)}
            />
          ) : (
            <WhatItCanDoTab outputs={data.outputs} onToggle={(id) => toggleOutput.mutate({ brain, id }, update)} />
          )
        }
      </QueryView>
    </Panel>
  );
}
