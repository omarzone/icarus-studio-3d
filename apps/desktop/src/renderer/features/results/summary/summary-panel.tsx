// PNL-SUMMARY
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { resultsPort, type SummaryView } from "../../../ports/results-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { resultsKeys } from "../use-results.ts";
import { NotesTab } from "./notes-tab.tsx";
import { SummaryTab } from "./summary-tab.tsx";

type Tab = "summary" | "notes";

type Props = { project: string; view: SummaryView; className?: string };

export function SummaryPanel({ project, view, className = "flex-1" }: Props) {
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("summary");
  const summary = useQuery({
    queryKey: resultsKeys.summary(project, view),
    queryFn: () => port.getSummary({ project, view }),
  });
  const notes = useQuery({
    queryKey: resultsKeys.notes(project),
    queryFn: () => port.getNotes(project),
    enabled: tab === "notes",
  });
  const save = useEngineAction(port.saveNotes);
  return (
    <Panel
      id="PNL-SUMMARY"
      className={className}
      tabs={
        <>
          <PanelTab label="Summary" active={tab === "summary"} onSelect={() => setTab("summary")} />
          <PanelTab label="Notes" active={tab === "notes"} onSelect={() => setTab("notes")} />
        </>
      }
    >
      {tab === "summary" ? (
        <QueryView query={summary}>{(data) => <SummaryTab summary={data} />}</QueryView>
      ) : (
        <QueryView query={notes}>
          {(data) => (
            <NotesTab
              notes={data}
              onSave={(text) =>
                save.mutate(
                  { project, text },
                  { onSuccess: (next) => client.setQueryData(resultsKeys.notes(project), next) },
                )
              }
            />
          )}
        </QueryView>
      )}
    </Panel>
  );
}
