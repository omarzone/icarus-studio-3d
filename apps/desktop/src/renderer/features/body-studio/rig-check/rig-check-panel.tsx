// PNL-RIG-CHECK
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { bodyPort } from "../../../ports/body-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { PoseTestTab } from "./pose-test-tab.tsx";
import { RigCheckTab } from "./rig-check-tab.tsx";
import { WeightsTab } from "./weights-tab.tsx";

type Tab = "check" | "pose" | "weights";

export const rigCheckKey = (body: string) => ["body", body, "rig-check"] as const;

export function useRigCheck(body: string) {
  const port = usePort(bodyPort);
  return useQuery({ queryKey: rigCheckKey(body), queryFn: () => port.getRigCheck(body) });
}

export function RigCheckPanel({ body }: { body: string }) {
  const port = usePort(bodyPort);
  const query = useRigCheck(body);
  const pose = useEngineAction(port.applyPose);
  const onPose = (id: string) => pose.mutate({ body, id });
  const [tab, setTab] = useState<Tab>("check");
  return (
    <Panel
      id="PNL-RIG-CHECK"
      className="h-42 shrink-0"
      tabs={
        <>
          <PanelTab label="Rig check" active={tab === "check"} onSelect={() => setTab("check")} />
          <PanelTab label="Pose test" active={tab === "pose"} onSelect={() => setTab("pose")} />
          <PanelTab label="Weights" active={tab === "weights"} onSelect={() => setTab("weights")} />
        </>
      }
    >
      {tab === "weights" ? (
        <WeightsTab body={body} />
      ) : (
        <QueryView query={query}>
          {(check) =>
            tab === "check" ? (
              <RigCheckTab check={check} onPose={onPose} />
            ) : (
              <PoseTestTab check={check} onPose={onPose} />
            )
          }
        </QueryView>
      )}
    </Panel>
  );
}
