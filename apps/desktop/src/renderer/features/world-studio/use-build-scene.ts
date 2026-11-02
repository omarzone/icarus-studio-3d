import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigation, useNavigationStore } from "../../app/navigation/navigation-store.tsx";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import { useBuildProgress } from "../copilot/build-progress-card.tsx";

// The build the building state follows: the route's `build` in the app, the sample build in the prototype.
export function useBuildKey(sample: string): string | null {
  const mode = useRuntimeMode();
  const build = useNavigation((state) => state.params.build);
  return mode === "prototype" ? sample : (build ?? null);
}

export type BuildScene =
  | { kind: "starting" }
  | { kind: "building"; build: string; project: string | null; ready: boolean }
  | { kind: "failed"; reason: string };

// In the app the building state has no project to edit until the engine creates one; when the build is ready
// it opens the World workspace on the new project. The prototype shows its sample build in place.
export function useBuildScene(sample: string): BuildScene {
  const mode = useRuntimeMode();
  const build = useBuildKey(sample);
  const progress = useBuildProgress(build);
  const store = useNavigationStore();
  const client = useQueryClient();
  const project = progress.data?.projectId ?? null;
  // Once the project exists the route names it, so the chat, the header and History follow it during the build.
  useEffect(() => {
    const navigation = store.getState();
    if (mode === "app" && project && navigation.params.project !== project) {
      navigation.replaceParams({ ...navigation.params, project });
    }
  }, [mode, project, store]);
  const steps = progress.data?.steps.filter((step) => step.status === "done").length ?? 0;
  const opened = useRef(false);
  // Each finished step can add objects, so the explorer and viewport read the new project again.
  useEffect(() => {
    if (mode === "app" && project && steps > 0) {
      void client.invalidateQueries({ queryKey: ["scene", project] });
    }
  }, [mode, project, steps, client]);
  const ready = progress.data?.ready ?? false;
  useEffect(() => {
    if (mode === "app" && ready && project && !opened.current) {
      opened.current = true;
      store.getState().go("SCR-WORLD", { project });
    }
  }, [mode, ready, project, store]);
  if (mode === "prototype") {
    return { kind: "building", build: sample, project: sample, ready };
  }
  if (build === null) {
    return { kind: "starting" };
  }
  if (progress.isError) {
    return { kind: "failed", reason: progress.error.message };
  }
  if (progress.data?.error) {
    return { kind: "failed", reason: progress.data.error };
  }
  return { kind: "building", build, project, ready };
}
