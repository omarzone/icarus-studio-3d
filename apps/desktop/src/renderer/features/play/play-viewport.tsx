import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { type PlayAction, type PlaySession, playPort } from "../../ports/play-port.ts";
import type { ScenePick } from "../../scene/scene-view.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { ErrorState, LoadingState } from "../../ui/states.tsx";
import { PlayToolBar } from "./play-tool-bar.tsx";
import { instantAction, nextSpeed, pickAction } from "./play-tools.ts";
import { usePlayCache, usePlayLive, usePlaySession } from "./use-play-session.ts";

const PLAIN_VIEWS = [
  { id: "play", label: "Play" },
  { id: "game-view", label: "Game view" },
];

type Props = { project: string; closed: string | null; onReconnect: () => void };

// The live world with the Play tools; it re-renders with every frame, so it reads the session on its own.
export function PlayViewport({ project, closed, onReconnect }: Props) {
  const port = usePort(playPort);
  const session = usePlaySession(project);
  const live = usePlayLive(project);
  const cache = usePlayCache(project);
  const select = useEngineAction(port.selectTool);
  const speed = useEngineAction(port.setSpeed);
  const act = useEngineAction(port.send);
  const [held, setHeld] = useState<string | null>(null);
  const data = session.data;
  const send = (action: PlayAction) => act.mutate({ project, action });
  const pause = data?.paused === undefined ? [] : [data.paused ? "Resume" : "Pause"];
  return (
    <ViewportPanel
      label="The world, live"
      tabs={
        data ? data.views.map((view, index) => ({ id: index === 0 ? "play" : "second", label: view })) : PLAIN_VIEWS
      }
      note="Tools follow its senses"
      viewOptions={[data?.speed ?? "1×", ...pause]}
      onViewOption={(option) => {
        if (!data) {
          return;
        }
        if (option === data.speed) {
          speed.mutate({ project, speed: nextSpeed(data.speed) }, { onSuccess: cache });
        } else {
          send({ tool: "pause", paused: !data.paused });
        }
      }}
      play={{
        live: live.data ?? null,
        onPick: (pick: ScenePick) => {
          if (!data) {
            return;
          }
          const result = pickAction(data.selectedTool, pick, held, live.data ?? null);
          setHeld(result.held);
          if (result.action) {
            send(result.action);
          }
        },
      }}
      overlays={
        closed ? (
          <div className="absolute inset-0 bg-panel">
            <ErrorState
              title="The live world stopped"
              body="Nothing changed in the project."
              detail={closed}
              action={
                <Act cta="Reconnect" onClick={onReconnect} className={buttonClass("primary")}>
                  Reconnect
                </Act>
              }
            />
          </div>
        ) : data ? (
          <PlayOverlays
            session={data}
            placing={held ? `Click where to put ${held}` : data.placing}
            onSelect={(tool) => {
              setHeld(null);
              select.mutate({ project, tool }, { onSuccess: cache });
              const action = instantAction(tool);
              if (action) {
                send(action);
              }
            }}
          />
        ) : session.isPending ? (
          <div className="absolute inset-0">
            <LoadingState label="Connecting to the live world" />
          </div>
        ) : null
      }
    />
  );
}

type OverlayProps = { session: PlaySession; placing?: string; onSelect: Parameters<typeof PlayToolBar>[0]["onSelect"] };

function PlayOverlays({ session, placing, onSelect }: OverlayProps) {
  return (
    <>
      <PlayToolBar tools={session.tools} selected={session.selectedTool} onSelect={onSelect} />
      {placing ? (
        <div className="absolute top-1/2 left-[61%] rounded-button bg-overlay px-2.5 py-1.5 text-ui">{placing}</div>
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
