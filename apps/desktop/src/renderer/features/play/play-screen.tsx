// SCR-PLAY · SCR-PLAY.b
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { type PlaySession, playPort } from "../../ports/play-port.ts";
import { useProjectName } from "../../ui/project-name.ts";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { BrainActivitySlot } from "./brain-activity-slot.tsx";
import { DecisionsPanel } from "./decisions/decisions-panel.tsx";
import { EventsPanel } from "./events/events-panel.tsx";
import { PlayHeader } from "./play-header/play-header.tsx";
import { PlayShell } from "./play-shell.tsx";
import { PlayToolBar } from "./play-tool-bar.tsx";
import { PLAY_CONFIGS, PLAY_VARIANTS } from "./play-variants.ts";
import { SensesPanel } from "./senses/senses-panel.tsx";
import { usePlayCache, usePlaySession } from "./use-play-session.ts";
import { VisionPanel } from "./vision/vision-panel.tsx";

const PLAIN_VIEWS = [
  { id: "play", label: "Play" },
  { id: "game-view", label: "Game view" },
];

// Play mode: the current brain live in its world; the panels follow what the body senses and what brain it has.
export function PlayScreen() {
  const screen = useNavigation((state) => state.screen);
  const config = PLAY_CONFIGS[PLAY_VARIANTS[screen] ?? "learned"];
  const project = useProjectName(config.project);
  const session = usePlaySession(project.id);
  const data = session.data;
  return (
    <PlayShell
      header={<PlayHeader project={project.name} returnTo={config.returnTo} />}
      left={
        <>
          <SensesPanel project={project.id} className={data?.vision ? "flex-1" : "flex-none"} />
          {data?.vision ? <VisionPanel project={project.id} /> : <DecisionsPanel project={project.id} />}
        </>
      }
      center={
        <>
          <ViewportPanel
            label="The world, live"
            tabs={
              data
                ? data.views.map((view, index) => ({ id: index === 0 ? "play" : "second", label: view }))
                : PLAIN_VIEWS
            }
            note="Tools follow its senses"
            viewOptions={[data?.speed ?? "1×"]}
            overlays={data ? <PlayOverlays project={project.id} session={data} /> : null}
          />
          {data?.activity ? (
            <div className="grid h-49 flex-none grid-cols-[1.4fr_1fr] gap-2.5">
              <BrainActivitySlot project={project.id} />
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

function PlayOverlays({ project, session }: { project: string; session: PlaySession }) {
  const port = usePort(playPort);
  const cache = usePlayCache(project);
  const select = useEngineAction(port.selectTool);
  return (
    <>
      <PlayToolBar
        tools={session.tools}
        selected={session.selectedTool}
        onSelect={(tool) => select.mutate({ project, tool }, { onSuccess: cache })}
      />
      {session.placing ? (
        <div className="absolute top-1/2 left-[61%] rounded-button bg-overlay px-2.5 py-1.5 text-ui">
          {session.placing}
        </div>
      ) : null}
      <div
        role="status"
        className="absolute bottom-3 left-3 flex flex-col gap-0.5 rounded-card-sm bg-overlay px-3 py-2"
      >
        <span className="font-semibold">{session.status.title}</span>
        <span className="text-ui text-fg-secondary">{session.status.detail}</span>
      </div>
    </>
  );
}
