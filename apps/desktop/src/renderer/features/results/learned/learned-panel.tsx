// PNL-LEARNED
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { GoTo } from "../../../app/navigation/go-to.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { resultsPort } from "../../../ports/results-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { resultsKeys } from "../use-results.ts";
import { HowItLearnedTab } from "./how-it-learned-tab.tsx";

export function LearnedPanel({ project, className = "h-42 flex-none" }: { project: string; className?: string }) {
  const port = usePort(resultsPort);
  const history = useQuery({ queryKey: resultsKeys.history(project), queryFn: () => port.getLearningHistory(project) });
  return (
    <Panel
      id="PNL-LEARNED"
      className={className}
      tabs={<PanelTab label="How it learned" active />}
      options={
        <>
          {history.data?.training ? <span className="text-ui text-ok">● Training</span> : null}
          <GoTo
            to="SCR-TIMELAPSE"
            cta="Timelapse"
            className="ml-1 flex items-center gap-1 rounded-full bg-control-raised px-2.25 py-0.75 text-ui hover:bg-fill-ghost"
          >
            <Play size={12} strokeWidth={1.75} aria-hidden />
            Timelapse
          </GoTo>
        </>
      }
    >
      <QueryView
        query={history}
        isEmpty={(data) => data.checkpoints.length === 0}
        empty={<EmptyState title="No checkpoints yet" body="Checkpoints appear here as the run learns." />}
      >
        {(data) => <HowItLearnedTab checkpoints={data.checkpoints} />}
      </QueryView>
    </Panel>
  );
}
