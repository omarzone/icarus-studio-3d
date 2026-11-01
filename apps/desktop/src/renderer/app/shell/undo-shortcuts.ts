import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { revisionsPort } from "../../ports/revisions-port.ts";
import { useNavigation } from "../navigation/navigation-store.tsx";
import { useEngineAction } from "../runtime/engine-query.tsx";
import { usePort } from "../runtime/port.tsx";

type Keys = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; typing: boolean };

// Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. Fields keep their own undo while typing.
export function shortcutAction({ key, ctrlKey, metaKey, shiftKey, typing }: Keys): "undo" | "redo" | null {
  if (typing || !(ctrlKey || metaKey)) {
    return null;
  }
  const letter = key.toLowerCase();
  if (letter === "z") {
    return shiftKey ? "redo" : "undo";
  }
  return letter === "y" ? "redo" : null;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}

// Undo and redo for the open project from anywhere in its workspace.
export function useUndoShortcuts(): void {
  const project = useNavigation((state) => state.params.project);
  const port = usePort(revisionsPort);
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "templates" });
  const undo = useEngineAction(port.undo);
  const redo = useEngineAction(port.redo);
  useEffect(() => {
    if (!project) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      const action = shortcutAction({ ...event, key: event.key, typing: isTyping(event.target) });
      if (!action) {
        return;
      }
      event.preventDefault();
      (action === "undo" ? undo : redo).mutate(project, { onSuccess: () => void refresh() });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}
