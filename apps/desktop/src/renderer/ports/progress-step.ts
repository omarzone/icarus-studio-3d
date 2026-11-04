// One step of a long engine job (auto-rig, pose tracking): done, running now, or still to do.
export type ProgressStep = { text: string; state: "done" | "running" | "todo" };

// A fact with its meaning: "ok" when it works, "warn" when it needs attention, and the part it is about, if any.
export type CheckFact = { text: string; tone: "ok" | "warn"; part?: string };

// Live values shown on a card over the view ("What the brain sees now", "Firing right now").
export type LiveReadings = {
  title: string;
  rows: readonly { label: string; value: string; ratio: number; hot: boolean }[];
  caption: string;
};
