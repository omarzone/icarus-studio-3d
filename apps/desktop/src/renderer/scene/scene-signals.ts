import type { LightRole, PlateSignal, SceneSignals } from "@icarus/contracts";

// The goal and light states the engine measured, one per training copy (a single world is copy 0). The view only
// shows them; it never decides whether a goal is met or a light is on.
export type CopySignals = readonly (SceneSignals | null | undefined)[];

// Where the signals for this render frame come from: recorded motion keeps them in step with its poses.
export type SignalFeed = (now: number) => CopySignals;

const NONE: CopySignals = [];

export function signalFeed(
  signals: CopySignals | undefined,
  player?: { at: (now: number) => { signals?: CopySignals } },
) {
  return (now: number): CopySignals => (player ? (player.at(now).signals ?? NONE) : (signals ?? NONE));
}

// The copy a geom or zone belongs to: copies laid side by side name theirs "<copy>:<name>".
export function copyOf(name: string, copies: number): number {
  if (copies <= 1) {
    return 0;
  }
  const match = /^(\d+):/.exec(name);
  return match ? Number(match[1]) : 0;
}

export function lampOn(role: LightRole, signals: SceneSignals | null | undefined): boolean {
  const lights = signals?.lights;
  if (!lights) {
    return false;
  }
  switch (role) {
    case "brake":
      return lights.brake;
    case "reverse":
      return lights.reverse;
    case "head":
      return lights.head;
  }
}

export function goalMet(signals: SceneSignals | null | undefined): boolean {
  return signals?.goal?.met ?? false;
}

// The name an item has in the engine's signals: copies side by side prefix theirs with "<copy>:", and object ids
// never hold a colon.
export function ownName(name: string): string {
  return name.replace(/^\d+:/, "");
}

export function plateSignal(signals: SceneSignals | null | undefined, object: string): PlateSignal | undefined {
  return signals?.plates?.find((plate) => plate.object === object);
}

// The value the engine reported for a display at this frame; null when it has none.
export function displayValue(signals: SceneSignals | null | undefined, object: string): number | null {
  return signals?.displays?.find((reading) => reading.object === object)?.value ?? null;
}
