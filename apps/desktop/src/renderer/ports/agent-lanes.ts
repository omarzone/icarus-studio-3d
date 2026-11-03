import type { RunStatus, SceneDescription, SceneRay, SceneSignals } from "@icarus/contracts";
import type { MotionPlayer, PlayedCopies } from "../scene/motion-player.ts";
import type { ReplayFrame } from "./training-port.ts";

// Several agents shown in one scene: each agent's run trains alone in its own world, so the scene joins what every
// run recorded. Agents never share physics; only their drawings meet, each in its own lane.

// One agent's line on the live view's scoreboard, from its run's status as the engine reports it.
export type AgentScore = {
  run: string;
  name: string;
  state: RunStatus["state"];
  step: number;
  total: number;
  // Share of evaluation episodes that reached the goal at the latest checkpoint; null before one or without a goal.
  success: number | null;
  bestStep: number | null;
};

export function agentScores(runs: readonly RunStatus[]): AgentScore[] {
  return runs.map((run) => ({
    run: run.run_id,
    name: run.agent_name ?? run.name,
    state: run.state,
    step: run.step,
    total: run.total_steps,
    success: run.success_rate ?? null,
    bestStep: run.best_step ?? null,
  }));
}

// The runs of a group in the order they started, which is the agents' order.
export function groupRuns(runs: readonly RunStatus[], group: string): RunStatus[] {
  return runs
    .filter((run) => run.group === group)
    .sort((a, b) => a.started_at.localeCompare(b.started_at) || a.run_id.localeCompare(b.run_id));
}

// Every run's frozen scene joined: the world they share once, and each agent's body and lane from its own run.
export function joinScenes(scenes: readonly SceneDescription[]): SceneDescription | null {
  const [first, ...rest] = scenes;
  if (!first) {
    return null;
  }
  const geoms = new Map(first.geoms.map((geom) => [geom.name, geom]));
  const bodies = new Map(first.bodies.map((body) => [body.name, body]));
  const zones = new Map((first.zones ?? []).map((zone) => [zone.name, zone]));
  const displays = new Map((first.displays ?? []).map((display) => [display.anchor.object, display]));
  const eyes = new Map((first.eyes ?? []).map((item) => [item.anchor.object, item]));
  const plates = new Map((first.plates ?? []).map((plate) => [plate.name, plate]));
  for (const scene of rest) {
    for (const geom of scene.geoms) {
      geoms.set(geom.name, geoms.get(geom.name) ?? geom);
    }
    for (const body of scene.bodies) {
      bodies.set(body.name, bodies.get(body.name) ?? body);
    }
    for (const zone of scene.zones ?? []) {
      zones.set(zone.name, zones.get(zone.name) ?? zone);
    }
    for (const display of scene.displays ?? []) {
      displays.set(display.anchor.object, displays.get(display.anchor.object) ?? display);
    }
    for (const item of scene.eyes ?? []) {
      eyes.set(item.anchor.object, eyes.get(item.anchor.object) ?? item);
    }
    for (const plate of scene.plates ?? []) {
      plates.set(plate.name, plates.get(plate.name) ?? plate);
    }
  }
  return {
    ...first,
    geoms: [...geoms.values()],
    bodies: [...bodies.values()],
    zones: [...zones.values()],
    displays: [...displays.values()],
    eyes: [...eyes.values()],
    plates: [...plates.values()],
  };
}

// One copy of every agent's run as one set of poses; geom names never repeat across agents' bodies.
export function joinPoses<P>(copies: readonly (ReadonlyMap<string, P> | undefined)[]): Map<string, P> {
  const joined = new Map<string, P>();
  for (const poses of copies) {
    for (const [name, pose] of poses ?? []) {
      joined.set(name, pose);
    }
  }
  return joined;
}

// The goal and lights of the first agent, and every agent's display readings (each lane's scoreboard is its own).
export function joinSignals(signals: readonly (SceneSignals | null | undefined)[]): SceneSignals | null {
  const present = signals.filter((item): item is SceneSignals => item !== null && item !== undefined);
  const [first] = present;
  if (!first) {
    return null;
  }
  const seen = new Set<string>();
  const displays = present.flatMap((item) =>
    (item.displays ?? []).filter((reading) => {
      if (seen.has(reading.object)) {
        return false;
      }
      seen.add(reading.object);
      return true;
    }),
  );
  return { ...first, displays };
}

// Plays every agent's first copy from its own run's recorded motion, as one copy.
export function joinedPlayer(players: () => readonly (MotionPlayer | undefined)[]): MotionPlayer {
  return {
    mode: "realtime",
    push: () => undefined,
    sample: (now): PlayedCopies => {
      const played = players().map((player) => player?.sample(now));
      const rays: SceneRay[] = played.flatMap((item) => item?.rays[0] ?? []);
      return {
        copies: [joinPoses(played.map((item) => item?.copies[0]))],
        rays: [rays],
        signals: [joinSignals(played.map((item) => item?.signals[0]))],
      };
    },
  };
}

// Every agent's recorded episode of one checkpoint as one replay, on the first agent's clock: at each of its frames
// every other agent shows its own latest frame at or before that time. A shorter episode holds its last pose.
export function joinReplayFrames(episodes: readonly (readonly ReplayFrame[])[]): ReplayFrame[] {
  const [lead] = episodes;
  const longest = episodes.reduce<readonly ReplayFrame[]>(
    (best, frames) => ((frames.at(-1)?.time ?? 0) > (best.at(-1)?.time ?? 0) ? frames : best),
    lead ?? [],
  );
  const clock = longest.map((frame) => frame.time);
  const cursors = episodes.map(() => 0);
  const at = (frames: readonly ReplayFrame[], index: number, time: number) => {
    let cursor = cursors[index] ?? 0;
    while (cursor + 1 < frames.length && (frames[cursor + 1]?.time ?? Number.POSITIVE_INFINITY) <= time) {
      cursor += 1;
    }
    cursors[index] = cursor;
    return frames[cursor];
  };
  return clock.map((time) => {
    const frames = episodes.map((frames, index) => at(frames, index, time));
    return {
      time,
      poses: joinPoses(frames.map((frame) => frame?.poses)),
      signals: joinSignals(frames.map((frame) => frame?.signals)),
    };
  });
}
