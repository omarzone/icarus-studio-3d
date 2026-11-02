// PNL-PLAY-DECISIONS
import { useRuntimeMode } from "../../../app/runtime/port.tsx";
import type { PlayBrainPick } from "../../../ports/play-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { usePlayBrains, usePlaySession } from "../use-play-session.ts";
import { type BrainChoice, WhatItDecidesTab } from "./what-it-decides-tab.tsx";

type Props = { project: string; className?: string; onChooseBrain?: (brain: PlayBrainPick) => void };

export function DecisionsPanel({ project, className = "flex-1", onChooseBrain }: Props) {
  const session = usePlaySession(project);
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
      <QueryView query={session}>
        {(data) =>
          data.decisions ? (
            <WhatItDecidesTab
              bars={data.decisions.bars}
              brain={data.decisions.brain}
              choice={choice(data.decisions.playing)}
            />
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
