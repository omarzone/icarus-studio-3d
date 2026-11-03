// SCR-IDEAS
import { useEffect } from "react";
import { useNavigation, useNavigationStore } from "../../app/navigation/navigation-store.tsx";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import { copilotPanel } from "../../app/shell/dock/dock-layout.ts";
import { DockWorkspaceShell } from "../../app/shell/dock/dock-workspace-shell.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { IdeasPanel } from "./ideas-panel.tsx";
import { ideasRouteParams } from "./ideas-route.ts";

const PICK_FIRST = "Pick an idea first";

// Before anything is built, three ways to make the idea to choose from with your eyes.
export function IdeasScreen() {
  const store = useNavigationStore();
  const app = useRuntimeMode() === "app";
  const leftover = useNavigation((state) => state.params.project) !== undefined;
  useEffect(() => {
    if (leftover) {
      store.getState().replaceParams(ideasRouteParams(store.getState().params));
    }
  }, [leftover, store]);
  return (
    <DockWorkspaceShell
      header={{
        project: "Untitled project",
        active: "World",
        activeGoesTo: app ? undefined : "SCR-WORLD",
        guide: "Guide",
        playEnabled: false,
        primary: { label: "Train", to: "MOD-START-TRAINING", disabled: true },
        workspacesLocked: app ? PICK_FIRST : undefined,
      }}
      layoutKey="ideas"
      panels={{
        ideas: { title: "Ideas", minimumWidth: 480, render: () => <IdeasPanel /> },
        chat: copilotPanel(() => (
          <ChatPanel
            conversation="ideas"
            placeholder="Describe what to change…"
            suggestionRoutes={{ "propose-change": "STA-WORLD-PROPOSAL" }}
            noProject={{
              title: "Pick an idea to start",
              body: "Choose one of the ideas and the copilot builds it. Then you can talk to it about that project.",
            }}
          />
        )),
      }}
    />
  );
}
