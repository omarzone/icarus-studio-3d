import { useCopilotOutbox } from "../../app/runtime/copilot-outbox.ts";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { useNotices } from "../../app/runtime/notices.ts";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { useSceneCache } from "../../editor/scene-queries.ts";
import { scenePort } from "../../ports/scene-port.ts";

// Environment tools select the object that holds that part of the world, so the inspector shows its settings.
const SELECTS: Readonly<Record<string, { kind: string; missing: string }>> = {
  Terrain: { kind: "surface", missing: "ground" },
  Sky: { kind: "sky", missing: "sky" },
  Light: { kind: "light", missing: "light" },
};

// Tools that ask the copilot to add what they name to the open project.
const ASKS: Readonly<Record<string, string>> = {
  Goal: "Add a goal zone the body should learn to reach.",
  Agent: "Add a body that can move and sense the world, ready to learn.",
};

// What the World tools do in the app; the prototype keeps its selectable tools.
export function useWorldToolActions(scene: string): Readonly<Record<string, () => void>> | undefined {
  const mode = useRuntimeMode();
  const port = usePort(scenePort);
  const cache = useSceneCache(scene);
  const notify = useNotices((state) => state.notify);
  const ask = useCopilotOutbox((state) => state.ask);
  const select = useEngineAction(port.selectKind);
  if (mode !== "app") {
    return undefined;
  }
  const selecting = Object.entries(SELECTS).map(([label, { kind, missing }]): [string, () => void] => [
    label,
    () =>
      select.mutate(
        { scene, kind },
        {
          onSuccess: (tree) =>
            tree
              ? cache.tree(tree)
              : notify({ title: `This world has no ${missing} yet`, detail: "Ask the copilot to add one." }),
        },
      ),
  ]);
  const asking = Object.entries(ASKS).map(([label, text]): [string, () => void] => [label, () => ask(scene, text)]);
  return Object.fromEntries([...selecting, ...asking]);
}
