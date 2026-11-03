// PNL-IDEAS
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useNavigationStore } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { CopilotNotConnected } from "../../ports/copilot-connection.ts";
import { type IdeaFilter, type IdeaMix, type IdeaSet, ideasPort } from "../../ports/ideas-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { CopilotNotConnectedState } from "../../ui/copilot-not-connected.tsx";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState, ErrorState } from "../../ui/states.tsx";
import { GeneratingIdeas } from "./generating-ideas.tsx";
import { IdeasSceneTab } from "./ideas-scene-tab.tsx";
import { IdeasTab } from "./ideas-tab.tsx";
import { useIdeaSet } from "./use-idea-set.ts";

export type IdeasPanelProps = { className?: string };

export function IdeasPanel({ className = "flex-1" }: IdeasPanelProps) {
  const [tab, setTab] = useState<"ideas" | "scene">("ideas");
  const state = useIdeaSet();
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
      {state.kind === "ready" ? (
        <Ideas set={state.set} tab={tab} />
      ) : state.kind === "generating" ? (
        <GeneratingIdeas />
      ) : state.error instanceof CopilotNotConnected ? (
        <CopilotNotConnectedState detail={state.error.message} />
      ) : (
        <ErrorState
          title="The copilot could not make ideas"
          detail={state.error.message}
          action={
            <Act cta="Try again" onClick={state.retry} className={buttonClass("primary")}>
              Try again
            </Act>
          }
        />
      )}
    </Panel>
  );
}

function Ideas({ set, tab }: { set: string | null; tab: "ideas" | "scene" }) {
  const port = usePort(ideasPort);
  const store = useNavigationStore();
  const [filter, setFilter] = useState<IdeaFilter>("whole");
  const client = useQueryClient();
  const ideas = useQuery({ queryKey: ["ideas", set, filter], queryFn: () => port.getIdeas({ set, filter }) });
  const use = useEngineAction(port.useIdea);
  const tweak = useEngineAction(port.tweakIdea);
  const mix = useEngineAction(port.mixAndBuild);
  // The building state follows the build once the engine answers; if it never starts, the screen goes back.
  const follow = (started: Promise<{ build: string }>, title: string | undefined) => {
    void started.then(
      ({ build }) => {
        const navigation = store.getState();
        if (navigation.screen === "STA-WORLD-BUILDING") {
          navigation.replaceParams(title ? { build, draftName: title } : { build });
        }
      },
      () => {
        const navigation = store.getState();
        if (navigation.screen === "STA-WORLD-BUILDING") {
          navigation.back();
        }
      },
    );
  };
  // "Use this" opens the building state at once.
  const startBuild = (data: IdeaSet, id: string) =>
    follow(use.mutateAsync({ set: data.id, idea: id }), data.ideas.find((idea) => idea.id === id)?.title);
  const startMix = (data: IdeaSet, chosen: IdeaMix) =>
    follow(mix.mutateAsync({ set: data.id, mix: chosen }), `${chosen.worldFrom} + ${chosen.bodyFrom}`);
  // The card changes once the copilot's revision passed its tests; the set is kept as the engine answered it.
  const tweakIdea = async (data: IdeaSet, id: string, words: string) => {
    const next = await tweak.mutateAsync({ set: data.id, idea: id, words });
    client.setQueryData(["ideas", set, filter], next);
  };
  return (
    <QueryView
      query={ideas}
      isEmpty={(data) => data.ideas.length === 0}
      empty={
        <EmptyState
          title="No ideas yet"
          body="Describe what you want to build on Home and the copilot will show three ways to make it."
        />
      }
    >
      {(data) =>
        tab === "ideas" ? (
          <IdeasTab
            set={data}
            filter={filter}
            onFilter={setFilter}
            onUse={(id) => startBuild(data, id)}
            onTweak={(id, words) => tweakIdea(data, id, words)}
            onMix={() => {
              if (data.mix) {
                startMix(data, data.mix);
              }
            }}
          />
        ) : (
          <div className="flex h-full flex-col">
            <IdeasSceneTab idea={data.ideas.find((idea) => idea.recommended) ?? data.ideas[0]} />
          </div>
        )
      }
    </QueryView>
  );
}
