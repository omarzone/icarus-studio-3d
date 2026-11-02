import { useEffect } from "react";
import { useNavigation } from "../navigation/navigation-store.tsx";

type Keys = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

export function isOpenProjectShortcut({ key, ctrlKey, metaKey, shiftKey, altKey }: Keys): boolean {
  return (ctrlKey || metaKey) && !shiftKey && !altKey && key.toLowerCase() === "o";
}

// Ctrl/Cmd+O opens the Projects screen from anywhere, as the project menu shows.
export function useOpenProjectShortcut(): void {
  const go = useNavigation((state) => state.go);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isOpenProjectShortcut(event)) {
        return;
      }
      event.preventDefault();
      go("SCR-PROJECTS", {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
}
