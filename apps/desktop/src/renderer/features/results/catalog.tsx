import type { ReactNode } from "react";
import type { Catalog } from "../../app/navigation/route-registry.ts";
import { FailuresPanel } from "./failures/failures-panel.tsx";
import { LearnedPanel } from "./learned/learned-panel.tsx";
import { ReferenceMatchPanel } from "./reference-match/reference-match-panel.tsx";
import { ReferenceTestsPanel } from "./reference-tests/reference-tests-panel.tsx";
import { ReferenceViewPanel } from "./reference-view/reference-view-panel.tsx";
import { ResultRunsPanel } from "./result-runs/result-runs-panel.tsx";
import { ResultsScreen } from "./results-screen.tsx";
import { ResultsViewPanel } from "./results-view/results-view-panel.tsx";
import { SummaryPanel } from "./summary/summary-panel.tsx";
import { TimelapseScreen } from "./timelapse-screen.tsx";

function Column({ width, children }: { width: string; children: ReactNode }) {
  return <div className={`flex h-[900px] flex-col gap-2.5 p-3 ${width}`}>{children}</div>;
}

export const catalog: Catalog = {
  routes: [
    { id: "SCR-RESULTS", maxDiff: 0.03, component: ResultsScreen },
    { id: "STA-RESULTS-FAILURES", maxDiff: 0.03, component: ResultsScreen },
    { id: "STA-RESULTS-REFERENCE", maxDiff: 0.045, component: ResultsScreen },
    { id: "SCR-TIMELAPSE", maxDiff: 0.03, component: TimelapseScreen },
  ],
  modules: [
    {
      id: "PNL-RESULT-RUNS",
      component: () => (
        <Column width="w-69">
          <ResultRunsPanel project="park-pilot" />
        </Column>
      ),
    },
    {
      id: "PNL-SUMMARY",
      component: () => (
        <Column width="w-69">
          <SummaryPanel project="park-pilot" view="failures" />
        </Column>
      ),
    },
    {
      id: "PNL-RESULTS-VIEW",
      component: () => (
        <Column width="w-200">
          <ResultsViewPanel project="park-pilot" tab="where-it-fails" />
        </Column>
      ),
    },
    {
      id: "PNL-LEARNED",
      component: () => (
        <Column width="w-200">
          <LearnedPanel project="park-pilot" />
        </Column>
      ),
    },
    {
      id: "PNL-FAILURES",
      component: () => (
        <Column width="w-69">
          <FailuresPanel project="park-pilot" />
        </Column>
      ),
    },
    {
      id: "PNL-REFERENCE-TESTS",
      component: () => (
        <Column width="w-69">
          <ReferenceTestsPanel project="fruit-fly" />
        </Column>
      ),
    },
    {
      id: "PNL-REFERENCE-VIEW",
      component: () => (
        <Column width="w-200">
          <ReferenceViewPanel project="fruit-fly" />
        </Column>
      ),
    },
    {
      id: "PNL-REFERENCE-MATCH",
      component: () => (
        <Column width="w-200">
          <ReferenceMatchPanel project="fruit-fly" />
        </Column>
      ),
    },
  ],
};
