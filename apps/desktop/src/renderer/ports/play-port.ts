import type { PlayGeomPose, SceneDescription, SceneRay } from "@icarus/contracts";
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
  // Outputs of a learned brain and which brain is playing.
  decisions?: { bars: readonly LiveBar[]; brain: string };
  // What each eye or camera sees, when the body has vision.
  vision?: readonly CompoundEye[];
  // Connectome brains show their live neuron activity (read from the brain port).
  activity?: boolean;
  events: readonly PlayEvent[];
};

type Vec3 = [number, number, number];

export type PlayPose = Pick<PlayGeomPose, "position" | "quaternion">;

// What the Play viewport draws: the compiled world and where every geom is now, in MuJoCo axes by geom name.
export type PlayLive = {
  scene: SceneDescription | null;
  poses: ReadonlyMap<string, PlayPose>;
  // Where each distance sensor looks now and what it reads.
  rays: readonly SceneRay[];
  paused: boolean;
  speed: number;
};

// What the user did with a Play tool; points and directions are in MuJoCo world axes.
export type PlayAction =
  | { tool: "move"; object: string; to: Vec3 }
  | { tool: "push"; object: string; direction: Vec3 }
  | { tool: "add-object"; piece: string; at: Vec3 }
  | { tool: "touch"; object: string }
  | { tool: "light" }
  | { tool: "wind" }
  | { tool: "slow" }
  | { tool: "reset" }
  | { tool: "shuffle" }
  | { tool: "pause"; paused: boolean };

export type PlayListener = {
  onUpdate: (session: PlaySession, live: PlayLive) => void;
  // The session ended or could not start; Reconnect connects again.
  onClosed: (reason: string) => void;
  // The engine refused a command; the session goes on.
  onError: (message: string) => void;
};

export type PlayPort = {
  getSession: (project: string) => Promise<PlaySession>;
  selectTool: (input: { project: string; tool: PlayToolId }) => Promise<PlaySession>;
  setSpeed: (input: { project: string; speed: string }) => Promise<PlaySession>;
  // Streams the live session while Play is open; the returned function disconnects.
  connect: (project: string, listener: PlayListener) => () => void;
  send: (input: { project: string; action: PlayAction }) => Promise<void>;
};

export const playPort = definePort<PlayPort>({
  app: createEnginePlayPort(),
  prototype: createPlayFixture,
});

// The library piece Add object places.
export const PLACED_PIECE = { id: "box", label: "Box" } as const;

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
