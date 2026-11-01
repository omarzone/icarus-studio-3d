// SCR-RESULTS · STA-RESULTS-FAILURES · STA-RESULTS-REFERENCE
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { copilotPanel, type DockPanels, HOME } from "../../app/shell/dock/dock-layout.ts";
import { DockWorkspaceShell } from "../../app/shell/dock/dock-workspace-shell.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { guideLabel } from "../../ui/guide-label.ts";
import { useProjectKey, useProjectName } from "../../ui/project-name.ts";
import { NoProjectState } from "../../ui/states.tsx";
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
  const scene = useProjectKey(config.scene);
  if (project.id === null || scene === null) {
    return <NoProjectState />;
  }
  return <ResultsWorkspace variant={variant} project={{ id: project.id, name: project.name }} scene={scene} />;
}

type WorkspaceProps = { variant: ResultsVariant; project: { id: string; name: string }; scene: string };

function ResultsWorkspace({ variant, project, scene }: WorkspaceProps) {
  const config = RESULTS_CONFIGS[variant];
  const guide = useGuide(scene);
  return (
    <DockWorkspaceShell
      header={{
        project: project.name,
        active: "Results",
        activeGoesTo: config.activeGoesTo,
        routes: config.routes,
        playTo: config.playTo,
        guide: guideLabel(guide.data),
        primary: config.primary,
      }}
      layoutKey="results"
      panels={{
        ...PANELS[variant](project.id),
        chat: copilotPanel(() => (
          <ChatPanel
            conversation={config.conversation}
            placeholder={config.placeholder}
            suggestionRoutes={config.suggestionRoutes}
          />
        )),
      }}
    />
  );
}

const VIEW = { minimumWidth: 360, minimumHeight: 200 } as const;

const PANELS: Record<ResultsVariant, (project: string) => DockPanels> = {
  compare: (project) => ({
    runs: { title: "Runs", home: HOME.left, render: () => <ResultRunsPanel project={project} /> },
    summary: {
      title: "Summary",
      home: HOME.below("runs", 613),
      render: () => <SummaryPanel project={project} view="best" />,
    },
    view: { title: "Compare", ...VIEW, render: () => <ResultsViewPanel project={project} tab="compare" /> },
    learned: {
      title: "How it learned",
      home: HOME.below("view", 168),
      render: () => <LearnedPanel project={project} />,
    },
  }),
  failures: (project) => ({
    failures: { title: "Failures", home: HOME.left, render: () => <FailuresPanel project={project} /> },
    summary: {
      title: "Summary",
      home: HOME.below("failures", 569),
      render: () => <SummaryPanel project={project} view="failures" />,
    },
    view: {
      title: "Where it fails",
      ...VIEW,
      render: () => <ResultsViewPanel project={project} tab="where-it-fails" />,
    },
  }),
  reference: (project) => ({
    tests: { title: "Tests", home: HOME.left, render: () => <ReferenceTestsPanel project={project} /> },
    summary: {
      title: "Summary",
      home: HOME.below("tests", 629),
      render: () => <SummaryPanel project={project} view="reference" />,
    },
    view: { title: "Reference", ...VIEW, render: () => <ReferenceViewPanel project={project} /> },
    match: { title: "Match", home: HOME.below("view", 257), render: () => <ReferenceMatchPanel project={project} /> },
  }),
};
