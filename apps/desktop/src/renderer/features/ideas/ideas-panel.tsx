// PNL-IDEAS
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type IdeaFilter, ideasPort } from "../../ports/ideas-port.ts";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { IdeasSceneTab } from "./ideas-scene-tab.tsx";
import { IdeasTab } from "./ideas-tab.tsx";

export type IdeasPanelProps = { className?: string };

export function IdeasPanel({ className = "flex-1" }: IdeasPanelProps) {
  const port = usePort(ideasPort);
  const [tab, setTab] = useState<"ideas" | "scene">("ideas");
  const [filter, setFilter] = useState<IdeaFilter>("whole");
  const ideas = useQuery({ queryKey: ["ideas", filter], queryFn: () => port.getIdeas({ filter }) });
  const use = useEngineAction(port.useIdea);
  const tweak = useEngineAction(port.tweakIdea);
  const mix = useEngineAction(port.mixAndBuild);
  return (
    <Panel
      id="PNL-IDEAS"
      className={className}
      tabs={
        <>
          <PanelTab label="Ideas" active={tab === "ideas"} onSelect={() => setTab("ideas")} />
          <PanelTab label="Scene" active={tab === "scene"} onSelect={() => setTab("scene")} />
        </>
      }
    >
      <QueryView
        query={ideas}
        isEmpty={(data) => data.ideas.length === 0}
        empty={
          <EmptyState
            title="No ideas yet"
            body="Describe what you want to build in the chat and the copilot will show three ways to make it."
          />
        }
      >
        {(data) =>
          tab === "ideas" ? (
            <IdeasTab
              set={data}
              filter={filter}
              onFilter={setFilter}
              onUse={(id) => use.mutate(id)}
              onTweak={(id) => tweak.mutate(id)}
              onMix={() => {
                if (data.mix) {
                  mix.mutate(data.mix);
                }
              }}
            />
          ) : (
            <div className="flex h-full flex-col">
              <IdeasSceneTab title={(data.ideas.find((idea) => idea.recommended) ?? data.ideas[0])?.title ?? ""} />
            </div>
          )
        }
      </QueryView>
    </Panel>
  );
}
