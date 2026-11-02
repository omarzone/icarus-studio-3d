import type { RuntimeMode } from "../app/runtime/port.tsx";

// A document a workspace shows (scene, brain, conversation): the open project's in the app, the sample in the
// prototype. Null in the app while no project is open, so no sample key ever reaches the engine.
export function sampleDocumentKey(mode: RuntimeMode, project: string | undefined, sample: string): string | null {
  if (mode === "prototype") {
    return sample;
  }
  return project ?? null;
}

// The open project: the route's in both modes; the prototype falls back to its example project.
export function openProjectId(mode: RuntimeMode, project: string | undefined, sample: string): string | null {
  if (mode === "prototype") {
    return project ?? sample;
  }
  return project ?? null;
}
