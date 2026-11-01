// SCR-IDEAS
import { WorkspaceShell } from "../../app/shell/workspace-shell.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { IdeasPanel } from "./ideas-panel.tsx";

// Before anything is built, three ways to make the idea to choose from with your eyes.
export function IdeasScreen() {
  return (
    <WorkspaceShell
      header={{
        project: "Untitled project",
        active: "World",
        activeGoesTo: "SCR-WORLD",
        guide: "Guide",
        playEnabled: false,
        primary: { label: "Train", to: "MOD-START-TRAINING", disabled: true },
      }}
      page={<IdeasPanel />}
      chat={
        <ChatPanel
          conversation="ideas"
          placeholder="Describe what to change…"
          suggestionRoutes={{ "propose-change": "STA-WORLD-PROPOSAL" }}
        />
      }
    />
  );
}
