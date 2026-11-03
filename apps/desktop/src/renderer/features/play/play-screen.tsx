// SCR-PLAY · SCR-PLAY.b
import { memo, useState } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import { BrainActivityPanel } from "../../editor/brain-activity/brain-activity-panel.tsx";
import type { PlayBrainPick } from "../../ports/play-port.ts";
import { useProjectName } from "../../ui/project-name.ts";
import { NoProjectState } from "../../ui/states.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { DecisionsPanel } from "./decisions/decisions-panel.tsx";
import type { BrainChoice } from "./decisions/what-it-decides-tab.tsx";
import { EventsPanel } from "./events/events-panel.tsx";
import { PlayHeader } from "./play-header/play-header.tsx";
import { PlayShell } from "./play-shell.tsx";
import { PLAY_CONFIGS, PLAY_VARIANTS, type PlayConfig } from "./play-variants.ts";
import { PlayViewport } from "./play-viewport.tsx";
import { SensesPanel } from "./senses/senses-panel.tsx";
import { usePlayBrain, usePlayBrains, usePlayConnection, usePlayLayout, usePlayPlaying } from "./use-play-session.ts";
import { VisionPanel } from "./vision/vision-panel.tsx";

// The panels read their own slices of the live session, so a new frame never re-renders the ones it leaves alone.
const Senses = memo(SensesPanel);
const Vision = memo(VisionPanel);
const Decisions = memo(DecisionsPanel);
const Events = memo(EventsPanel);
const Activity = memo(BrainActivityPanel);
const Chat = memo(ChatPanel);

const ACTIVITY_TABS = ["activity"] as const;

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
  // The brain picked with Use another brain, for this Play session only.
  const [chosen, choose] = useState<PlayBrainPick>();
  const connection = usePlayConnection(project.id, chosen);
  const layout = usePlayLayout(project.id).data;
  // Only the app names the brain in the header; the prototype keeps its design.
  const brain = usePlayBrain(project.id);
  const app = useRuntimeMode() === "app";
  const brains = usePlayBrains(project.id);
  const playing = usePlayPlaying(project.id);
  const choice: BrainChoice | undefined = app
    ? { brains: brains.data, failure: brains.error?.message, playing, onChoose: choose }
    : undefined;
  return (
    <PlayShell
      header={
        <PlayHeader project={project.name} returnTo={config.returnTo} brain={app ? brain : undefined} choice={choice} />
      }
      left={
        <>
          <Senses project={project.id} className={layout?.vision ? "flex-1" : "flex-none"} />
          {layout?.vision ? <Vision project={project.id} /> : <Decisions project={project.id} onChooseBrain={choose} />}
        </>
      }
      center={
        <>
          <PlayViewport project={project.id} closed={connection.closed} onReconnect={connection.reconnect} />
          {layout?.activity ? (
            <div className="grid h-49 flex-none grid-cols-[1.4fr_1fr] gap-2.5">
              <Activity brain={project.id} tabs={ACTIVITY_TABS} className="min-w-0" />
              <Events project={project.id} className="min-w-0" />
            </div>
          ) : (
            <Events project={project.id} />
          )}
        </>
      }
      chat={
        <Chat
          conversation={config.conversation}
          placeholder="Ask what it is doing…"
          suggestionRoutes={config.suggestionRoutes}
        />
      }
    />
  );
}
