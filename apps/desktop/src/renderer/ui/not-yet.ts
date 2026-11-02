import { useNotices } from "../app/runtime/notices.ts";
import { useRuntimeMode } from "../app/runtime/port.tsx";

// Props that turn a control with nothing behind it yet into a visibly dimmed one that says so on hover and click.
export type NotYetProps = { "aria-disabled": true; title: string; onClick: () => void };

// Dims a control marked not available yet; add it to the control's own classes.
export const NOT_YET_CLASS = "aria-disabled:opacity-35";

// In the app: a maker of not-yet props for a control (`name`, and what it will do); in the prototype: null,
// so the sample keeps its design.
export function useNotYet(): ((name: string, purpose: string) => NotYetProps) | null {
  const app = useRuntimeMode() === "app";
  const notify = useNotices((state) => state.notify);
  if (!app) {
    return null;
  }
  return (name, purpose) => ({
    "aria-disabled": true,
    title: `${name}: ${purpose}. Not available yet.`,
    onClick: () => notify({ title: `${name} is not available yet`, detail: `${purpose}.` }),
  });
}
