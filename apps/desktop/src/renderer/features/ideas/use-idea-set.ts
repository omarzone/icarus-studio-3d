import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useNavigation, useNavigationStore } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { ideasPort } from "../../ports/ideas-port.ts";
import { ideasRouteParams } from "./ideas-route.ts";

export type IdeaSetState =
  | { kind: "ready"; set: string | null }
  | { kind: "generating"; prompt: string }
  | { kind: "failed"; error: Error; retry: () => void };

// The idea set the screen shows: the route's `ideaSet`; opened with a `prompt` instead, the copilot generates it
// first and the route keeps its id, so coming back reads the same ideas instead of asking again.
export function useIdeaSet(): IdeaSetState {
  const port = usePort(ideasPort);
  const store = useNavigationStore();
  const prompt = useNavigation((state) => state.params.prompt) ?? "";
  const set = useNavigation((state) => state.params.ideaSet) ?? null;
  const generate = useMutation({ mutationFn: port.generateIdeas });
  const mounted = useRef(true);
  const start = useCallback(() => {
    void generate
      .mutateAsync(prompt)
      .then((created) => {
        if (mounted.current) {
          store.getState().replaceParams({ ...ideasRouteParams(store.getState().params), ideaSet: created.id });
        }
      })
      .catch(() => undefined);
  }, [generate, prompt, store]);
  const needsIdeas = prompt.trim() !== "" && set === null;
  const asked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (needsIdeas && !asked.current) {
      asked.current = true;
      start();
    }
    return () => {
      mounted.current = false;
    };
  }, [needsIdeas, start]);
  if (!needsIdeas) {
    return { kind: "ready", set };
  }
  if (generate.isError) {
    return { kind: "failed", error: generate.error, retry: start };
  }
  return { kind: "generating", prompt };
}
