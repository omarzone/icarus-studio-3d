// PNL-LEARNING
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { brainPort, type Learning } from "../../../ports/brain-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { AddRewardMenu } from "./add-reward-menu.tsx";
import { CurriculumTab } from "./curriculum-tab.tsx";
import { GoalTab } from "./goal-tab.tsx";
import { RewardTab } from "./reward-tab.tsx";

type Tab = "reward" | "goal" | "curriculum";

export function LearningPanel({ brain }: { brain: string }) {
  const port = usePort(brainPort);
  const client = useQueryClient();
  const key = ["brain", brain, "learning"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getLearning(brain) });
  const setWeight = useEngineAction(port.setRewardWeight);
  const remove = useEngineAction(port.removeRewardTerm);
  const [tab, setTab] = useState<Tab>("reward");
  const proposed = query.data?.proposedChanges ?? 0;
  // The reward changed the project, so its history and the guide are read again.
  const changed = (next: Learning) => {
    client.setQueryData(key, next);
    void client.invalidateQueries({
      predicate: (item) =>
        (item.queryKey[0] === "brain" && item.queryKey[1] === brain && item.queryKey[2] !== "learning") ||
        (item.queryKey[0] === "scene" && item.queryKey[1] === brain) ||
        item.queryKey[0] === "projects" ||
        item.queryKey[0] === "revisions",
    });
  };
  const onWeight = (id: string, weight: number) => setWeight.mutate({ brain, id, weight }, { onSuccess: changed });
  const onRemove = (id: string) => remove.mutate({ brain, id }, { onSuccess: changed });
  return (
    <Panel
      id="PNL-LEARNING"
      className="h-42 shrink-0"
      tabs={
        <>
          <PanelTab label="Reward" active={tab === "reward"} onSelect={() => setTab("reward")} />
          <PanelTab label="Goal" active={tab === "goal"} onSelect={() => setTab("goal")} />
          <PanelTab label="Curriculum" active={tab === "curriculum"} onSelect={() => setTab("curriculum")} />
        </>
      }
      options={
        <>
          {proposed > 0 ? (
            <span className="pr-1 text-ui text-proposal">
              {proposed} {proposed === 1 ? "change" : "changes"} proposed
            </span>
          ) : null}
          {tab === "reward" ? <AddRewardMenu brain={brain} onAdded={changed} /> : null}
        </>
      }
    >
      <QueryView query={query}>
        {(data) => <LearningTab tab={tab} learning={data} onWeight={onWeight} onRemove={onRemove} />}
      </QueryView>
    </Panel>
  );
}

function LearningTab({
  tab,
  learning,
  onWeight,
  onRemove,
}: {
  tab: Tab;
  learning: Learning;
  onWeight: (id: string, weight: number) => void;
  onRemove: (id: string) => void;
}) {
  switch (tab) {
    case "reward":
      return <RewardTab terms={learning.reward} onWeight={onWeight} onRemove={onRemove} />;
    case "goal":
      return <GoalTab goal={learning.goal} />;
    case "curriculum":
      return <CurriculumTab stages={learning.curriculum} />;
  }
}
