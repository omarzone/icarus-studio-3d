// SCR-PLAY · SCR-PLAY.b
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { BrainActivityPanel } from "../../editor/brain-activity/brain-activity-panel.tsx";
import { useProjectName } from "../../ui/project-name.ts";
import { NoProjectState } from "../../ui/states.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { DecisionsPanel } from "./decisions/decisions-panel.tsx";
import { EventsPanel } from "./events/events-panel.tsx";
import { PlayHeader } from "./play-header/play-header.tsx";
import { PlayShell } from "./play-shell.tsx";
import { PLAY_CONFIGS, PLAY_VARIANTS, type PlayConfig } from "./play-variants.ts";
import { PlayViewport } from "./play-viewport.tsx";
import { SensesPanel } from "./senses/senses-panel.tsx";
import { usePlayConnection, usePlayLayout } from "./use-play-session.ts";
import { VisionPanel } from "./vision/vision-panel.tsx";

// Play mode: the current brain live in its world; the panels follow what the body senses and what brain it has.
export function PlayScreen() {
  const screen = useNavigation((state) => state.screen);
  const config = PLAY_CONFIGS[PLAY_VARIANTS[screen] ?? "learned"];
  const project = useProjectName(config.project);
  if (project.id === null) {
    return <NoProjectState />;
  }
  return <PlaySession config={config} project={{ id: project.id, name: project.name }} />;
}

function PlaySession({ config, project }: { config: PlayConfig; project: { id: string; name: string } }) {
  const connection = usePlayConnection(project.id);
  const layout = usePlayLayout(project.id).data;
  return (
    <PlayShell
      header={<PlayHeader project={project.name} returnTo={config.returnTo} />}
      left={
        <>
          <SensesPanel project={project.id} className={layout?.vision ? "flex-1" : "flex-none"} />
          {layout?.vision ? <VisionPanel project={project.id} /> : <DecisionsPanel project={project.id} />}
        </>
      }
      center={
        <>
          <PlayViewport project={project.id} closed={connection.closed} onReconnect={connection.reconnect} />
          {layout?.activity ? (
            <div className="grid h-49 flex-none grid-cols-[1.4fr_1fr] gap-2.5">
              <BrainActivityPanel brain={project.id} tabs={["activity"]} className="min-w-0" />
              <EventsPanel project={project.id} className="min-w-0" />
            </div>
          ) : (
            <EventsPanel project={project.id} />
          )}
        </>
      }
      chat={
        <ChatPanel
          conversation={config.conversation}
          placeholder="Ask what it is doing…"
          suggestionRoutes={config.suggestionRoutes}
        />
      }
    />
  );
}
