// PNL-BUILD-TARGETS
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { RouteId } from "../../../app/navigation/catalog-id.ts";
import { usePort } from "../../../app/runtime/port.tsx";
import { type BuildTargetKind, buildPort } from "../../../ports/build-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { BuildTab } from "./build-tab.tsx";

type Props = {
  project: string;
  selected: BuildTargetKind;
  routes: Partial<Record<BuildTargetKind, RouteId>>;
  className?: string;
};

export function BuildTargetsPanel({ project, selected, routes, className = "flex-1" }: Props) {
  const port = usePort(buildPort);
  const targets = useQuery({ queryKey: ["build", "targets", project], queryFn: () => port.listTargets(project) });
  const [current, setCurrent] = useState(selected);
  return (
    <Panel id="PNL-BUILD-TARGETS" className={className} tabs={<PanelTab label="Build" active />}>
      <QueryView
        query={targets}
        isEmpty={(data) => data.length === 0}
        empty={<p className="p-3 text-ui text-fg-tertiary">Nothing to build until the project has a brain.</p>}
      >
        {(data) => <BuildTab targets={data} selected={current} routes={routes} onSelect={setCurrent} />}
      </QueryView>
    </Panel>
  );
}
