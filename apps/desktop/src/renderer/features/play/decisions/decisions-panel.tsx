// PNL-PLAY-DECISIONS
import { useRuntimeMode } from "../../../app/runtime/port.tsx";
import type { PlayBrainPick, PlaySession } from "../../../ports/play-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { usePlayBrains, usePlaySlice } from "../use-play-session.ts";
import { type BrainChoice, WhatItDecidesTab } from "./what-it-decides-tab.tsx";

type Props = { project: string; className?: string; onChooseBrain?: (brain: PlayBrainPick) => void };

const decisionsOf = (session: PlaySession) => session.decisions;

export function DecisionsPanel({ project, className = "flex-1", onChooseBrain }: Props) {
  const decisions = usePlaySlice(project, decisionsOf);
  const brains = usePlayBrains(project);
  // The prototype keeps the design's link to Results; the app lets the user pick the brain in place.
  const app = useRuntimeMode() === "app";
  const choice = (playing: PlayBrainPick | undefined): BrainChoice | undefined =>
    app && onChooseBrain
      ? {
          brains: brains.data,
          failure: brains.error ? brains.error.message : undefined,
          playing,
          onChoose: onChooseBrain,
        }
      : undefined;
  return (
    <Panel id="PNL-PLAY-DECISIONS" className={className} tabs={<PanelTab label="What it decides" active />}>
      <QueryView query={decisions}>
        {(data) =>
          data ? (
            <WhatItDecidesTab bars={data.bars} brain={data.brain} choice={choice(data.playing)} />
          ) : (
            <EmptyState
              title="No learned brain"
              body="This brain is wired, not trained, so it has no outputs to show."
            />
          )
        }
      </QueryView>
    </Panel>
  );
}
