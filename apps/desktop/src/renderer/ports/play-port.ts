import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createPlayFixture } from "./play.fixture.ts";

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

export type ActivityRegion = { name: string; total: number; active: number };

export type PlayEvent = { time: string; text: string };

export type PlaySession = {
  // View tabs of the Play viewport ("Agent view" for agents with a camera, "Game view" otherwise).
  views: readonly string[];
  tools: readonly PlayTool[];
  selectedTool: PlayToolId;
  speed: string;
  // What the agent is doing right now, in one bold and one plain line.
  status: { title: string; detail: string };
  // Hint near the cursor while placing an object ("Click to place: Sugar").
  placing?: string;
  senses: { bars: readonly LiveBar[]; note?: string };
  // Outputs of a learned brain and which brain is playing.
  decisions?: { bars: readonly LiveBar[]; brain: string };
  // What each eye or camera sees, when the body has vision.
  vision?: readonly CompoundEye[];
  // Neuron activity by region, for connectome brains.
  activity?: { live: boolean; regions: readonly ActivityRegion[] };
  events: readonly PlayEvent[];
};

export type PlayPort = {
  getSession: (project: string) => Promise<PlaySession>;
  selectTool: (input: { project: string; tool: PlayToolId }) => Promise<PlaySession>;
  setSpeed: (input: { project: string; speed: string }) => Promise<PlaySession>;
};

const playIds = ["SCR-PLAY", "SCR-PLAY.b"] as const;

export const playPort = definePort<PlayPort>({
  app: {
    getSession: pending({
      key: "play.session",
      summary: "Playing with the brain live in its world",
      sprint: 4,
      ids: [...playIds],
    }),
    selectTool: pending({ key: "play.tool", summary: "Using a Play tool in the world", sprint: 4, ids: [...playIds] }),
    setSpeed: pending({ key: "play.speed", summary: "Changing the Play speed", sprint: 4, ids: [...playIds] }),
  },
  prototype: createPlayFixture,
});
