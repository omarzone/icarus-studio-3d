// STA-WORLD-BUILDING
import { ArrowRight } from "lucide-react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import {
  ActivityPill,
  OverlayBottomLeft,
  OverlayBottomRight,
  OverlayTop,
} from "../../editor/viewport/viewport-overlays.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { ErrorState, LoadingState } from "../../ui/states.tsx";
import { BuildProgressCard, useBuildProgress } from "../copilot/build-progress-card.tsx";
import { useBuildScene } from "./use-build-scene.ts";
import type { WorldConfig } from "./world-variants.ts";
import { WorldWorkspace } from "./world-workspace.tsx";

// The project being generated: the world fills in as the engine builds it, then opens when ready.
export function BuildingWorld({ config }: { config: WorldConfig }) {
  const build = useBuildScene(config.scene);
  const back = useNavigation((state) => state.back);
  switch (build.kind) {
    case "starting":
      return <LoadingState label="Starting the build" />;
    case "failed":
      return (
        <ErrorState
          title="The project could not be built"
          detail={build.reason}
          action={
            <Act cta="Back to ideas" onClick={back} className={buttonClass("primary")}>
              Back to ideas
            </Act>
          }
        />
      );
    case "building":
      return build.project ? (
        <WorldWorkspace
          variant="building"
          config={config}
          scene={build.project}
          overlays={<BuildingOverlay build={build.build} project={build.project} />}
        />
      ) : (
        // Before the engine has created the project there is nothing to edit yet, only the steps.
        <div className="grid h-full place-items-center p-6">
          <div className="w-95">
            <BuildProgressCard scene={build.build} />
          </div>
        </div>
      );
  }
}

function BuildingOverlay({ build, project }: { build: string; project: string }) {
  const mode = useRuntimeMode();
  const progress = useBuildProgress(build);
  return (
    <>
      {progress.data ? (
        <OverlayTop>
          <ActivityPill text={progress.data.activity} />
        </OverlayTop>
      ) : null}
      {/* The prototype shows the steps in the chat; in the app the chat is the new project's, so they float here. */}
      {mode === "app" ? (
        <OverlayBottomLeft>
          <div className="w-80">
            <BuildProgressCard scene={build} />
          </div>
        </OverlayBottomLeft>
      ) : null}
      <OverlayBottomRight>
        <GoTo
          to="SCR-WORLD"
          cta="Open when ready"
          params={mode === "app" ? { project } : undefined}
          title="Opens the world as soon as the build finishes"
          className="flex h-8.5 items-center gap-2 rounded-button bg-selected px-3.5 text-body font-semibold text-on-selected hover:opacity-90 active:opacity-80"
        >
          Open when ready
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
        </GoTo>
      </OverlayBottomRight>
    </>
  );
}
