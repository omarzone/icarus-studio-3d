// PNL-VIEWPORT
import type { SceneGeom } from "@icarus/contracts";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import { type CameraMode, CameraViewContext, defaultCameraMode } from "../../scene/camera-mode.ts";
import { type RayView, RayViewContext, raysShownByDefault } from "../../scene/ray-lines.ts";
import { NOT_YET_CLASS, useNotYet } from "../../ui/not-yet.ts";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { CameraMenu } from "./camera-menu.tsx";
import { GameViewTab } from "./game-view-tab.tsx";
import { LiveTrainingTab, type TrainingView } from "./live-training-tab.tsx";
import { PlayTab, type PlayView } from "./play-tab.tsx";
import { RaysMenu } from "./rays-menu.tsx";
import { ReplayTab } from "./replay-tab.tsx";
import { SceneTab } from "./scene-tab.tsx";
import { ViewportSurface } from "./viewport-surface.tsx";
import { type ViewportTabs, ViewportTabsContext } from "./viewport-tabs.ts";

export type ViewportTab = { id: string; label: string };

export type ViewportPanelProps = {
  // What the view shows, read by assistive technology ("Parking lot under a dusk sky").
  label: string;
  // Tabs of the view; "scene", "game-view", "play", "live-training" and "replay" have their own tab files, other ids draw a plain surface.
  tabs?: readonly ViewportTab[];
  // View options on the right of the tab bar (Lit, Perspective, speed).
  viewOptions?: readonly string[];
  onViewOption?: (option: string) => void;
  // Plain note before the view options ("Tools follow its senses").
  note?: string;
  // PNL-TOOLBAR strip drawn between the tab bar and the view.
  toolbar?: ReactNode;
  // Cards, pills and buttons floating over the view; they position themselves (see viewport-overlays.tsx).
  overlays?: ReactNode;
  tint?: "proposal";
  // Geoms of a copilot proposal drawn in blue over the scene before it is applied.
  ghosts?: readonly SceneGeom[];
  // Project whose compiled scene the view draws; workspaces without an engine scene leave it out.
  scene?: string;
  // The live world the "play" tab draws.
  play?: PlayView;
  // The training run the "live-training" and "replay" tabs draw.
  training?: TrainingView;
  // The scene tab shows the training copies side by side instead of the editable scene.
  copiesPreview?: { onExit: () => void };
  // The view is about what the agent senses, so its distance sensors show from the start.
  senses?: boolean;
  className?: string;
};

export const DEFAULT_VIEWPORT_TABS: readonly ViewportTab[] = [
  { id: "scene", label: "Scene" },
  { id: "game-view", label: "Game view" },
];

const DEFAULT_OPTIONS = ["Lit", "Perspective"] as const;
// What view options without a handler will do, for the app's "not available yet" tooltip.
const OPTION_PURPOSES: Readonly<Record<string, string>> = { Lit: "Switch between lit, unlit and wireframe looks" };
// The view option the camera menu takes the place of.
const CAMERA_OPTION = "Perspective";

// Whether the tab draws an engine scene the camera can move around.
function drawsScene(tab: string, props: Pick<ViewportPanelProps, "scene" | "play" | "training">): boolean {
  switch (tab) {
    case "scene":
      return props.scene !== undefined;
    case "play":
      return props.play !== undefined;
    case "live-training":
    case "replay":
      return props.training !== undefined;
    default:
      return false;
  }
}

export function ViewportPanel({
  label,
  tabs = DEFAULT_VIEWPORT_TABS,
  viewOptions = DEFAULT_OPTIONS,
  onViewOption,
  note,
  toolbar,
  overlays,
  tint,
  ghosts,
  scene,
  play,
  training,
  copiesPreview,
  senses = false,
  className = "flex-1",
}: ViewportPanelProps) {
  const [active, setActive] = useState(tabs[0]?.id ?? "scene");
  // The checkpoint a card over the view asked Replay to play; choosing a tab by hand forgets it.
  const [replayFrom, setReplayFrom] = useState<number | null>(null);
  const select = (tab: string) => {
    setActive(tab);
    setReplayFrom(null);
  };
  const tabControl: ViewportTabs | null = tabs.some((tab) => tab.id === "replay")
    ? {
        replay: (step) => {
          setActive("replay");
          setReplayFrom(step);
        },
      }
    : null;
  // Each tab keeps the camera mode chosen in it; `frame` asks the camera to frame everything again.
  const [modes, setModes] = useState<Readonly<Record<string, CameraMode>>>({});
  const [frame, setFrame] = useState(0);
  // The prototype keeps its fixed camera and plain label, as in the design.
  const cameraReady = useRuntimeMode() === "app" && drawsScene(active, { scene, play, training });
  const mode = modes[active] ?? defaultCameraMode(active);
  const setMode = (next: CameraMode) => setModes((current) => ({ ...current, [active]: next }));
  const frameAll = () => {
    if (mode === "follow" || mode === "onboard") {
      setMode("free");
    }
    setFrame((count) => count + 1);
  };
  const camera = cameraReady ? { mode, frame, onFrameAll: frameAll } : null;
  // Each tab keeps its own ray options too; Replay has no sensor readings to draw.
  const [rayViews, setRayViews] = useState<Readonly<Record<string, RayView>>>({});
  const rayView = rayViews[active] ?? { shown: raysShownByDefault(active, senses), values: true, allCopies: false };
  const rays = cameraReady && active !== "replay" ? rayView : null;
  const setRayView = (next: RayView) => setRayViews((current) => ({ ...current, [active]: next }));
  const options = cameraReady ? viewOptions.filter((option) => option !== CAMERA_OPTION) : viewOptions;
  // Replay draws its own checkpoint card and player; the live run's would cover its controls.
  const shownOverlays = cameraReady && active === "replay" ? null : overlays;
  const surface = { label, tint, overlays: shownOverlays, scene, ghosts };
  const notYet = useNotYet();
  return (
    <Panel
      id="PNL-VIEWPORT"
      className={className}
      tabs={
        <>
          {tabs.map((tab) => (
            <PanelTab key={tab.id} label={tab.label} active={tab.id === active} onSelect={() => select(tab.id)} />
          ))}
          <Act
            cta="Add a view"
            aria-label="Add a view"
            title="Split the view"
            className={`grid h-6.5 place-items-center rounded-control px-2.5 text-fg-tertiary hover:bg-fill-hover hover:text-fg ${NOT_YET_CLASS}`}
            {...notYet?.("Add a view", "Split the viewport to see the world from two cameras at once")}
          >
            <Plus size={12} strokeWidth={1.75} aria-hidden />
          </Act>
        </>
      }
      options={
        <>
          {note ? <span className="mr-1 text-ui text-fg-tertiary">{note}</span> : null}
          {options.map((option) => (
            <Act
              key={option}
              cta={option}
              onClick={() => onViewOption?.(option)}
              className={`rounded-control bg-control px-2 py-0.75 text-ui text-fg-tertiary hover:bg-control-raised hover:text-fg ${NOT_YET_CLASS}`}
              {...(onViewOption ? {} : notYet?.(option, OPTION_PURPOSES[option] ?? "Change what the view shows"))}
            >
              {option}
            </Act>
          ))}
          {rays ? <RaysMenu view={rays} onView={setRayView} copies={active === "live-training"} /> : null}
          {camera ? <CameraMenu mode={mode} onMode={setMode} onFrameAll={frameAll} /> : null}
        </>
      }
    >
      <CameraViewContext value={camera}>
        <RayViewContext value={rays}>
          <ViewportTabsContext value={tabControl}>
            <div className="flex h-full flex-col">
              {toolbar}
              {active === "scene" ? (
                <SceneTab {...surface} copiesPreview={copiesPreview} />
              ) : active === "game-view" ? (
                <GameViewTab {...surface} />
              ) : active === "play" ? (
                <PlayTab {...surface} play={play} />
              ) : active === "live-training" ? (
                <LiveTrainingTab {...surface} training={training} />
              ) : active === "replay" ? (
                <ReplayTab {...surface} training={training} start={replayFrom} />
              ) : (
                <ViewportSurface {...surface} />
              )}
            </div>
          </ViewportTabsContext>
        </RayViewContext>
      </CameraViewContext>
    </Panel>
  );
}
