// PNL-MOTION-COMPARE
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type MotionCompare, motionPort } from "../../../ports/motion-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { Segmented } from "../../../ui/segmented.tsx";
import { OverlayTab } from "./overlay-tab.tsx";
import { ReferenceOnlyTab } from "./reference-only-tab.tsx";
import { SideBySideTab } from "./side-by-side-tab.tsx";

type Tab = "side" | "overlay" | "reference";

type Props = {
  clip: string;
  // Floating card over the comparison (training status).
  floating?: ReactNode;
};

export function MotionComparePanel({ clip, floating }: Props) {
  const port = usePort(motionPort);
  const client = useQueryClient();
  const key = ["motion", clip, "compare"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getCompare(clip) });
  const setSpeed = useEngineAction(port.setSpeed);
  const [tab, setTab] = useState<Tab>("side");
  const compare = query.data;
  return (
    <Panel
      id="PNL-MOTION-COMPARE"
      className="flex-1"
      tabs={
        <>
          <PanelTab label="Side by side" active={tab === "side"} onSelect={() => setTab("side")} />
          <PanelTab label="Overlay" active={tab === "overlay"} onSelect={() => setTab("overlay")} />
          <PanelTab label="Reference only" active={tab === "reference"} onSelect={() => setTab("reference")} />
        </>
      }
      options={
        compare ? (
          <Segmented
            items={compare.speeds.map((speed) => ({
              label: speed,
              active: speed === compare.speed,
              onSelect: () =>
                setSpeed.mutate(
                  { clip, speed },
                  { onSuccess: (next: MotionCompare) => client.setQueryData(key, next) },
                ),
            }))}
          />
        ) : null
      }
    >
      <div className="relative h-full">
        <QueryView query={query}>{(data) => <CompareTab tab={tab} compare={data} />}</QueryView>
        {floating}
      </div>
    </Panel>
  );
}

function CompareTab({ tab, compare }: { tab: Tab; compare: MotionCompare }) {
  switch (tab) {
    case "side":
      return <SideBySideTab compare={compare} />;
    case "overlay":
      return <OverlayTab compare={compare} />;
    case "reference":
      return <ReferenceOnlyTab compare={compare} />;
  }
}
