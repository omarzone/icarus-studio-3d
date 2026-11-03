// PNL-REFERENCE-TESTS
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus } from "lucide-react";
import { useState } from "react";
import { Act } from "../../../app/navigation/go-to.tsx";
import { useNavigation } from "../../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type Recording, type ReferenceTests, resultsPort } from "../../../ports/results-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { saveFile } from "../../../ui/save-file.ts";
import { EmptyState } from "../../../ui/states.tsx";
import { resultsKeys, useReferenceTests } from "../use-results.ts";
import { BehaviorTestsTab } from "./behavior-tests-tab.tsx";
import { RecordingsTab } from "./recordings-tab.tsx";

type Tab = "tests" | "recordings";

export function ReferenceTestsPanel({ project, className = "flex-none" }: { project: string; className?: string }) {
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const go = useNavigation((state) => state.go);
  const [tab, setTab] = useState<Tab>("tests");
  const tests = useReferenceTests(project);
  const recordings = useQuery({
    queryKey: resultsKeys.recordings(project),
    queryFn: () => port.listRecordings(project),
    enabled: tab === "recordings",
  });
  const select = useEngineAction(port.selectReferenceTest);
  const run = useEngineAction(port.runReferenceTest);
  const add = useEngineAction(port.addReferenceTest);
  const frame = useEngineAction(port.selectTimelapseFrame);
  const exported = useEngineAction(port.exportRecording);
  const save = (next: ReferenceTests) => client.setQueryData(resultsKeys.referenceTests(project), next);
  // A test that ran changes the comparison, the match table and the summary.
  const ran = (next: ReferenceTests) => {
    save(next);
    void client.invalidateQueries({ queryKey: resultsKeys.all(project) });
  };
  const play = (recording: Recording) =>
    frame.mutate(
      { project, id: recording.id },
      {
        onSuccess: (next) => {
          client.setQueryData(resultsKeys.timelapse(project), next);
          go("SCR-TIMELAPSE");
        },
      },
    );
  const exportOne = (recording: Recording) => {
    if (recording.run === undefined || recording.step === undefined) {
      return;
    }
    const step = recording.step;
    exported.mutate(
      { project, run: recording.run, step },
      { onSuccess: (file) => saveFile(file, `checkpoint-${step}.png`) },
    );
  };
  const canRun = tab === "tests" && (tests.data?.tests.length ?? 0) > 0;
  return (
    <Panel
      id="PNL-REFERENCE-TESTS"
      className={className}
      tabs={
        <>
          <PanelTab label="Behavior tests" active={tab === "tests"} onSelect={() => setTab("tests")} />
          <PanelTab label="Recordings" active={tab === "recordings"} onSelect={() => setTab("recordings")} />
        </>
      }
      options={
        <>
          {canRun ? (
            <Act
              cta="Run the selected test"
              aria-label="Run the selected test"
              title="Run the selected test on the compared checkpoints"
              disabled={run.isPending}
              onClick={() => run.mutate(project, { onSuccess: ran })}
              className={buttonClass("icon", "size-6! text-fg-tertiary! disabled:opacity-50")}
            >
              <Play size={12} strokeWidth={1.75} aria-hidden />
            </Act>
          ) : null}
          <Act
            cta="Add a test"
            aria-label="Add a test"
            title="Add a behavior test with new fixed starts"
            disabled={add.isPending}
            onClick={() => add.mutate(project, { onSuccess: save })}
            className={buttonClass("icon", "size-6! text-fg-tertiary! disabled:opacity-50")}
          >
            <Plus size={14} strokeWidth={1.75} aria-hidden />
          </Act>
        </>
      }
    >
      {tab === "tests" ? (
        <QueryView
          query={tests}
          isEmpty={(data) => data.tests.length === 0}
          empty={
            <EmptyState title="No behavior tests yet" body="Add a test to judge checkpoints on fixed scenarios." />
          }
        >
          {(data) => (
            <div className="flex flex-col">
              <BehaviorTestsTab tests={data} onSelect={(id) => select.mutate({ project, id }, { onSuccess: save })} />
              {run.isPending || data.judged ? (
                <span className="px-4 pb-2 text-meta text-fg-tertiary">
                  {run.isPending ? "Running the test with MuJoCo…" : data.judged}
                </span>
              ) : null}
            </div>
          )}
        </QueryView>
      ) : (
        <QueryView
          query={recordings}
          isEmpty={(data) => data.length === 0}
          empty={<EmptyState title="No recordings yet" body="Every checkpoint records one evaluation episode." />}
        >
          {(data) => (
            <RecordingsTab
              recordings={data}
              onPlay={play}
              onExport={exportOne}
              exporting={exported.isPending ? "pending" : null}
            />
          )}
        </QueryView>
      )}
    </Panel>
  );
}
