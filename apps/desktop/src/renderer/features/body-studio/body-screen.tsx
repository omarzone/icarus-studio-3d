// SCR-BODY · STA-BODY-CHECK-FAILED
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { WorkspaceShell } from "../../app/shell/workspace-shell.tsx";
import { ExplorerPanel } from "../../editor/explorer/explorer-panel.tsx";
import { InspectorPanel } from "../../editor/inspector/inspector-panel.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { Toolbar } from "../../editor/viewport/toolbar/toolbar.tsx";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { CHARACTER_WORKSPACES, guidePillLabel, useOpenProjectName } from "../../ui/project-name.ts";
import { LoadingState } from "../../ui/states.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { BODY_VARIANTS, bodyConfig } from "./body-variants.ts";
import { CheckFailedBanner } from "./check-failed-banner.tsx";
import { RigCheckPanel } from "./rig-check/rig-check-panel.tsx";

// The bone inspector is taller than its panel; it scrolls without a gutter, as in the design.
const INSPECTOR_CLASS = "flex-[1.1] [&>div:last-child]:[scrollbar-width:none]";

const RIG_TABS = [
  { id: "rig", label: "Rig" },
  { id: "mesh", label: "Mesh" },
] as const;

// The body workspace; the route decides whether the physics checks pass or block training.
export function BodyScreen() {
  const screen = useNavigation((state) => state.screen);
  const overlay = useNavigation((state) => state.overlay);
  const variant = BODY_VARIANTS[screen] ?? "rig";
  const config = bodyConfig(variant, overlay);
  const project = useOpenProjectName("dance-copy");
  const guide = useGuide(config.scene);
  // The header's project name and guide pill change label once they load, so the screen waits for them.
  if (guide.isPending || project === null) {
    return <LoadingState label="Opening the workspace" />;
  }
  const toolbar = <Toolbar groups={config.tools} selected={config.selectedTool} overrides={config.toolOverrides} />;
  return (
    <WorkspaceShell
      header={{
        project,
        active: "Body",
        workspaces: CHARACTER_WORKSPACES,
        activeGoesTo: "SCR-BODY",
        guide: guidePillLabel(guide.data),
        playTo: "SCR-MOTION",
        primary: { label: "Train", to: "MOD-START-TRAINING" },
      }}
      left={
        <>
          <ExplorerPanel scene={config.scene} label={config.explorerLabel} />
          <InspectorPanel
            scene={config.scene}
            addComponentTo={config.rigged ? "POP-ADD-COMPONENT" : undefined}
            className={INSPECTOR_CLASS}
          />
        </>
      }
      center={
        config.rigged ? (
          <>
            <ViewportPanel
              label="The body seen through, with its bones, joints and colliders"
              tabs={RIG_TABS}
              toolbar={toolbar}
              overlays={variant === "check-failed" ? <CheckFailedBanner body={config.body} /> : null}
            />
            <RigCheckPanel body={config.body} />
          </>
        ) : (
          <ViewportPanel label="The project's world before a body is imported" toolbar={toolbar} />
        )
      }
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
