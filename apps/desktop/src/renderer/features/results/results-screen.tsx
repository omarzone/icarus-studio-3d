// SCR-RESULTS · STA-RESULTS-FAILURES · STA-RESULTS-REFERENCE
import type { ReactNode } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { WorkspaceShell } from "../../app/shell/workspace-shell.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { guideLabel } from "../../ui/guide-label.ts";
import { useProjectName } from "../../ui/project-name.ts";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { FailuresPanel } from "./failures/failures-panel.tsx";
import { LearnedPanel } from "./learned/learned-panel.tsx";
import { ReferenceMatchPanel } from "./reference-match/reference-match-panel.tsx";
import { ReferenceTestsPanel } from "./reference-tests/reference-tests-panel.tsx";
import { ReferenceViewPanel } from "./reference-view/reference-view-panel.tsx";
import { ResultRunsPanel } from "./result-runs/result-runs-panel.tsx";
import { RESULTS_CONFIGS, RESULTS_VARIANTS, type ResultsVariant } from "./results-variants.ts";
import { ResultsViewPanel } from "./results-view/results-view-panel.tsx";
import { SummaryPanel } from "./summary/summary-panel.tsx";

// The Results workspace: fair comparisons, where it fails, or how close a reference brain is to recordings.
export function ResultsScreen() {
  const screen = useNavigation((state) => state.screen);
  const variant = RESULTS_VARIANTS[screen] ?? "compare";
  const config = RESULTS_CONFIGS[variant];
  const project = useProjectName(config.project);
  const guide = useGuide(config.scene);
  const columns = COLUMNS[variant](project.id);
  return (
    <WorkspaceShell
      header={{
        project: project.name,
        active: "Results",
        activeGoesTo: config.activeGoesTo,
        routes: config.routes,
        playTo: config.playTo,
        guide: guideLabel(guide.data),
        primary: config.primary,
      }}
      left={columns.left}
      center={columns.center}
      chat={
        <ChatPanel
          conversation={config.conversation}
          placeholder={config.placeholder}
          suggestionRoutes={config.suggestionRoutes}
        />
      }
    />
  );
}

const COLUMNS: Record<ResultsVariant, (project: string) => { left: ReactNode; center: ReactNode }> = {
  compare: (project) => ({
    left: (
      <>
        <ResultRunsPanel project={project} />
        <SummaryPanel project={project} view="best" />
      </>
    ),
    center: (
      <>
        <ResultsViewPanel project={project} tab="compare" />
        <LearnedPanel project={project} />
      </>
    ),
  }),
  failures: (project) => ({
    left: (
      <>
        <FailuresPanel project={project} />
        <SummaryPanel project={project} view="failures" />
      </>
    ),
    center: <ResultsViewPanel project={project} tab="where-it-fails" />,
  }),
  reference: (project) => ({
    left: (
      <>
        <ReferenceTestsPanel project={project} />
        <SummaryPanel project={project} view="reference" />
      </>
    ),
    center: (
      <>
        <ReferenceViewPanel project={project} />
        <ReferenceMatchPanel project={project} />
      </>
    ),
  }),
};
