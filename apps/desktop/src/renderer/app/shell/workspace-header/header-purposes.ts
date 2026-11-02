import type { Workspace } from "./workspace-header.tsx";

// One-line purposes shown on hover, so a first-time user knows what each header control is for.

export const WORKSPACE_PURPOSES: Readonly<Record<Workspace, string>> = {
  World: "World: the place it lives in, with its ground, objects, goal and sky",
  Body: "Body: its parts, joints, motors and sensors",
  Motion: "Motion: copy a movement from a video onto the body",
  Brain: "Brain: what it senses, what it can do and what it is rewarded for",
  Train: "Train: practice, where the brain learns over many tries in parallel copies",
  Results: "Results: compare runs and see where it still fails",
  Build: "Build: export the trained brain or share the project",
};

export const PLAY_PURPOSE =
  "Try it live: watch the current brain act in the world and poke it with tools; nothing changes the project";

const PRIMARY_PURPOSES: Readonly<Record<string, string>> = {
  Train: "Practice: the brain learns over many tries in parallel copies. You choose how long before it starts",
  Stop: "Stop the run that is training now; the best brain so far is kept",
};

export function primaryPurpose(label: string): string | undefined {
  return PRIMARY_PURPOSES[label];
}
