// PNL-RIG-CHECK
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort, useRuntimeMode } from "../../../app/runtime/port.tsx";
import { bodyPort } from "../../../ports/body-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { poseKey } from "../pose-preview.tsx";
import { PartsTab } from "./parts-tab.tsx";
import { PoseTestTab } from "./pose-test-tab.tsx";
import { RigCheckTab } from "./rig-check-tab.tsx";
import { WeightsTab } from "./weights-tab.tsx";

type Tab = "check" | "pose" | "weights" | "parts";

export const rigCheckKey = (body: string) => ["body", body, "rig-check"] as const;

export function useRigCheck(body: string) {
  const port = usePort(bodyPort);
  return useQuery({ queryKey: rigCheckKey(body), queryFn: () => port.getRigCheck(body) });
}

export function RigCheckPanel({ body }: { body: string }) {
  const port = usePort(bodyPort);
  const query = useRigCheck(body);
  const client = useQueryClient();
  const pose = useEngineAction(port.applyPose);
  const onPose = (id: string) =>
    pose.mutate({ body, id }, { onSuccess: (preview) => client.setQueryData(poseKey(body), preview) });
  const [tab, setTab] = useState<Tab>("check");
  // The parts summary reads the project document, so only the app has one; the prototype keeps the design's tabs.
  const app = useRuntimeMode() === "app";
  return (
    <Panel
      id="PNL-RIG-CHECK"
      className="h-42 shrink-0"
      tabs={
        <>
          <PanelTab label="Rig check" active={tab === "check"} onSelect={() => setTab("check")} />
          <PanelTab label="Pose test" active={tab === "pose"} onSelect={() => setTab("pose")} />
          <PanelTab label="Weights" active={tab === "weights"} onSelect={() => setTab("weights")} />
          {app ? <PanelTab label="Parts" active={tab === "parts"} onSelect={() => setTab("parts")} /> : null}
        </>
      }
    >
      {tab === "parts" ? (
        <PartsTab body={body} />
      ) : tab === "weights" ? (
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
