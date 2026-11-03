// PNL-CLIP-TIMELINE
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type ClipTimeline, motionPort } from "../../../ports/motion-port.ts";
import { ActionButton } from "../../../ui/action-button.tsx";
import { buttonClass } from "../../../ui/button-styles.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { ClipTab } from "./clip-tab.tsx";
import { MatchScoreTab } from "./match-score-tab.tsx";

type Tab = "clip" | "match";

export function ClipTimelinePanel({ clip }: { clip: string }) {
  const port = usePort(motionPort);
  const client = useQueryClient();
  const key = ["motion", clip, "clip"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getClip(clip) });
  const select = useEngineAction(port.selectFrame);
  const [tab, setTab] = useState<Tab>("clip");
  const timeline = query.data;
  return (
    <Panel
      id="PNL-CLIP-TIMELINE"
      className="h-42 shrink-0"
      tabs={
        <>
          <PanelTab label={timeline?.label ?? "Clip"} active={tab === "clip"} onSelect={() => setTab("clip")} />
          <PanelTab label="Match score" active={tab === "match"} onSelect={() => setTab("match")} />
        </>
      }
      options={
        timeline ? (
          <span className="flex items-center gap-2 pr-1 text-ui text-warn">
            {timeline.weakest}
            {timeline.practice ? (
              <ActionButton
                cta="Practice it"
                to="STA-MOTION-TRAINING"
                run={() => port.trainWeakestMoment(clip)}
                title="Train again from the latest brain, starting more tries at this moment"
                className={buttonClass("secondary")}
              >
                Practice it
              </ActionButton>
            ) : null}
          </span>
        ) : null
      }
    >
      {tab === "clip" ? (
        <QueryView query={query}>
          {(data) => (
            <ClipTab
              timeline={data}
              onFrame={(index) =>
                select.mutate({ clip, index }, { onSuccess: (next: ClipTimeline) => client.setQueryData(key, next) })
              }
            />
          )}
        </QueryView>
      ) : (
        <MatchScoreTab clip={clip} />
      )}
    </Panel>
  );
}
