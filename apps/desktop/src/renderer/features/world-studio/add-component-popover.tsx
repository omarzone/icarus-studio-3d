// POP-ADD-COMPONENT
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCloseOverlay } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { AddComponentMenu } from "../../editor/inspector/add-component-menu.tsx";
import { useSceneCache } from "../../editor/scene-queries.ts";
import { scenePort } from "../../ports/scene-port.ts";
import { useAnchoredStyle } from "../../ui/anchored.ts";
import { useDismiss } from "../../ui/dismiss.ts";
import { useProjectKey } from "../../ui/project-name.ts";

// Scene the gallery opens the picker on when no route parameter names one; the app falls back to the open project.
const EXAMPLE_SCENE = "park-pilot";
const ANCHOR = '[data-route-screen] [data-cta="add-component"]:not([inert] *)';

// The Add component picker, floating next to the inspector's "+ Add component" button.
export function AddComponentPopover() {
  const fallback = useProjectKey(EXAMPLE_SCENE);
  const scene = useNavigation((state) => state.params.addTo) ?? fallback;
  return scene === null ? null : <AddComponentPicker scene={scene} />;
}

function AddComponentPicker({ scene }: { scene: string }) {
  const close = useCloseOverlay();
  const port = usePort(scenePort);
  const cache = useSceneCache(scene);
  const add = useEngineAction(port.addComponent);
  const anchor = useRef<HTMLElement | null>(null);
  const placed = useAnchor(anchor);
  const surface = useRef<HTMLDivElement>(null);
  const inside = useMemo(() => [surface, anchor], []);
  const dismiss = useCallback(() => close(), [close]);
  useDismiss(placed, inside, dismiss);
  const placement = useAnchoredStyle(placed, anchor, surface, "start");
  return (
    <div ref={surface} role="dialog" aria-label="Add component" style={placement} className="fixed z-40 w-90">
      <AddComponentMenu
        onPick={(kind) =>
          add.mutate(
            { scene, kind },
            {
              onSuccess: (inspection) => {
                cache.inspection(inspection);
                close();
              },
            },
          )
        }
      />
    </div>
  );
}

// The button can render after the picker (the inspector may still be loading), so wait until it is in the page.
function useAnchor(anchor: { current: HTMLElement | null }): boolean {
  const [found, setFound] = useState(false);
  useLayoutEffect(() => {
    const find = () => {
      anchor.current = document.querySelector<HTMLElement>(ANCHOR);
      setFound(anchor.current !== null);
      return anchor.current !== null;
    };
    if (find()) {
      return;
    }
    const watcher = new MutationObserver(() => {
      if (find()) {
        watcher.disconnect();
      }
    });
    watcher.observe(document.body, { childList: true, subtree: true });
    return () => watcher.disconnect();
  }, [anchor]);
  return found;
}
