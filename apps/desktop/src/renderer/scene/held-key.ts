import { useEffect, useState } from "react";

type KeyState = { key: string; ctrlKey: boolean; metaKey: boolean };

// Holding Ctrl (Cmd on macOS) while dragging the gizmo moves, turns and stretches freely, without the snap.
export function bypassesSnap({ key, ctrlKey, metaKey }: KeyState): boolean {
  return ctrlKey || metaKey || key === "Control" || key === "Meta";
}

// Whether the snap bypass key is held right now; letting go or leaving the window ends it.
export function useSnapBypass(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) =>
      setHeld(bypassesSnap({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey }));
    const up = (event: KeyboardEvent) => setHeld(event.ctrlKey || event.metaKey);
    const release = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
    };
  }, []);
  return held;
}
