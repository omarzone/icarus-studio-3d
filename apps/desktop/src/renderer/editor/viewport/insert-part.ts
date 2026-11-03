import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { scenePort } from "../../ports/scene-port.ts";
import { viewFocus } from "../../scene/view-focus.ts";
import { useSceneCache } from "../scene-queries.ts";
import { useBuildSettings } from "./build-settings.ts";

type Point = readonly [number, number, number];

// Inserts a part as one create-object edit, selects it and refreshes the scene; snapped to the move snap.
export function useInsertPart(scene: string | undefined): (shape: string, at: Point) => void {
  const port = usePort(scenePort);
  const cache = useSceneCache(scene ?? "");
  const insert = useEngineAction(port.insertPart);
  const move = useBuildSettings((state) => state.move);
  return (shape, at) => {
    if (scene) {
      insert.mutate({ scene, shape, at, snap: move }, { onSuccess: cache.objects });
    }
  };
}

// What choosing a part in the toolbar does: insert it at the middle of the view, or wait for a click to place it.
export function usePickPart(scene: string): (shape: string) => void {
  const insert = useInsertPart(scene);
  const placeOnClick = useBuildSettings((state) => state.placeOnClick);
  const setPlacing = useBuildSettings((state) => state.setPlacing);
  return (shape) => {
    if (placeOnClick) {
      setPlacing(shape);
      return;
    }
    insert(shape, viewFocus());
  };
}
