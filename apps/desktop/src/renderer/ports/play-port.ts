import type { PlayGeomPose, SceneDescription, SceneRay, SceneSignals } from "@icarus/contracts";
import { definePort } from "../app/runtime/port.tsx";
import { createPlayFixture } from "./play.fixture.ts";
import { createEnginePlayPort } from "./play-engine.ts";

// Play mode: the current brain running live in its world. Nothing done here changes the project.

// Core tools exist for every project; the others come from the body's senses and the world.
export type PlayToolId =
  | "move"
  | "push"
  | "add-object"
  | "light"
  | "wind"
  | "shadow"
  | "scent"
  | "touch"
  | "shuffle"
  | "slow"
  | "reset";

export type PlayTool = { id: PlayToolId; label: string };

export type BarTone = "default" | "ok" | "warn" | "danger";

export type SenseIcon = "smell" | "hunger" | "light" | "antenna" | "touch" | "wind" | "balance";

// One live value: a sensor reading or a brain output, as a share of its range and its text.
export type LiveBar = { id: string; label: string; icon?: SenseIcon; ratio: number; display: string; tone: BarTone };

export type CompoundEye = { label: string; rows: number; columns: number; cells: readonly number[] };

export type PlayEvent = { time: string; text: string };

export type PlaySession = {
  // View tabs of the Play viewport ("Agent view" for agents with a camera, "Game view" otherwise).
  views: readonly string[];
  tools: readonly PlayTool[];
  selectedTool: PlayToolId;
  speed: string;
  // Whether the live world is paused; only a live session knows it.
  paused?: boolean;
  // What the agent is doing right now, in one bold and one plain line.
  status: { title: string; detail: string };
  // Hint near the cursor while placing an object ("Click to place: Sugar").
  placing?: string;
  senses: { bars: readonly LiveBar[]; note?: string };
  // Outputs of a learned brain and which brain is playing (`playing`: its run and checkpoint, when trained).
  decisions?: { bars: readonly LiveBar[]; brain: string; playing?: PlayBrainPick };
  // What each eye or camera sees, when the body has vision.
  vision?: readonly CompoundEye[];
  // Connectome brains show their live neuron activity (read from the brain port).
  activity?: boolean;
  events: readonly PlayEvent[];
  // Library pieces Add object can bring in, with the values its options start from; only a live session lists them.
  pieces?: readonly PlayPiece[];
};

// A library piece for Add object; `mass` is null for a piece fixed in place, which can only be placed.
export type PlayPiece = {
  id: string;
  label: string;
  category: string;
  mass: number | null;
  friction: number;
  bounciness: number;
  color: string;
};

// Resting on the clicked point, dropped from a height above it, or thrown from there at the agent.
export type DropPlacement = "place" | "drop" | "throw";

// What Add object brings and how; a null value keeps the piece's own. `count` above 1 drops copies over time.
export type PlayDrop = {
  piece: string;
  placement: DropPlacement;
  scale: number;
  weight: { kind: "mass" | "density"; value: number } | null;
  friction: number | null;
  bounciness: number | null;
  color: string | null;
  height: number;
  speed: number;
  count: number;
  interval: number;
  spread: number;
};

// What the engine is doing before a session's first frame.
export type PlayStage = "world" | "brain" | "starting";

type Vec3 = [number, number, number];

export type PlayPose = Pick<PlayGeomPose, "position" | "quaternion">;

// What the Play viewport draws: the compiled world and where every geom is now, in MuJoCo axes by geom name.
export type PlayLive = {
  scene: SceneDescription | null;
  poses: ReadonlyMap<string, PlayPose>;
  // Where each distance sensor looks now and what it reads.
  rays: readonly SceneRay[];
  // Whether the goal's rules hold and which vehicle lights are on, as the engine measured them.
  signals?: SceneSignals | null;
  paused: boolean;
  speed: number;
};

// What the user did with a Play tool; points and directions are in MuJoCo world axes.
export type PlayAction =
  | { tool: "move"; object: string; to: Vec3 }
  | { tool: "push"; object: string; direction: Vec3 }
  | { tool: "add-object"; drop: PlayDrop; at: Vec3 }
  | { tool: "touch"; object: string }
  | { tool: "light" }
  | { tool: "wind" }
  | { tool: "slow" }
  | { tool: "reset" }
  | { tool: "shuffle" }
  | { tool: "pause"; paused: boolean };

// A trained brain: one run's checkpoint.
export type PlayBrainPick = { runId: string; step: number };

// A trained brain Play could use ("Run 3 · 500k steps · revision 12 · 80% success"); one that does not fit the body
// says why. `isDefault` is the one Play picks when none is chosen.
export type PlayBrain = PlayBrainPick & { label: string; fits: boolean; reason?: string; isDefault: boolean };

export type PlayListener = {
  onUpdate: (session: PlaySession, live: PlayLive) => void;
  // The session ended or could not start; Reconnect connects again.
  onClosed: (reason: string) => void;
  // The engine refused a command; the session goes on.
  onError: (message: string) => void;
  // A session is opening: compiling the world, loading the brain or starting.
  onProgress?: (stage: PlayStage) => void;
};

export type PlayPort = {
  getSession: (project: string) => Promise<PlaySession>;
  selectTool: (input: { project: string; tool: PlayToolId }) => Promise<PlaySession>;
  setSpeed: (input: { project: string; speed: string }) => Promise<PlaySession>;
  // Streams the live session while Play is open, with `brain` instead of the default one; the returned function
  // disconnects.
  connect: (project: string, listener: PlayListener, brain?: PlayBrainPick) => () => void;
  // Every trained brain of the project, newest first.
  brains: (project: string) => Promise<readonly PlayBrain[]>;
  send: (input: { project: string; action: PlayAction }) => Promise<void>;
};

export const playPort = definePort<PlayPort>({
  app: createEnginePlayPort(),
  prototype: createPlayFixture,
});

// The library pieces Add object can place, the first by default: boxes and spheres, movable and fixed.
export const PLACED_PIECES = [
  { id: "box", label: "Box" },
  { id: "ball", label: "Ball" },
  { id: "block", label: "Block" },
  { id: "sphere", label: "Sphere" },
] as const;
export type PlacedPiece = (typeof PLACED_PIECES)[number];
export const PLACED_PIECE: PlacedPiece = PLACED_PIECES[0];

// Tools that act the moment they are picked; the others act on a click in the world.
export function actsAtOnce(tool: PlayToolId): boolean {
  switch (tool) {
    case "light":
    case "wind":
    case "slow":
    case "reset":
    case "shuffle":
      return true;
    case "move":
    case "push":
    case "add-object":
    case "touch":
    case "shadow":
    case "scent":
      return false;
  }
}
