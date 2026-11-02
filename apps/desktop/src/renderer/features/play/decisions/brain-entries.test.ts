import { describe, expect, it, vi } from "vitest";
import type { PlayBrain } from "../../../ports/play-port.ts";
import { brainEntries } from "./brain-entries.ts";

const fits: PlayBrain = { runId: "run-2", step: 500, label: "Run 2 · 500 steps", fits: true, isDefault: true };
const changed: PlayBrain = {
  runId: "run-1",
  step: 300,
  label: "Run 1 · 300 steps",
  fits: false,
  reason: "The body changed: 41 senses now, 37 then",
  isDefault: false,
};

describe("brain entries", () => {
  it("checks the brain playing and dims the one that no longer fits, saying why", () => {
    const entries = brainEntries([fits, changed], { runId: "run-2", step: 500 }, () => undefined);
    expect(entries.map((entry) => ("label" in entry ? [entry.checked, entry.disabled, entry.hint] : []))).toEqual([
      [true, false, "Plays by default"],
      [false, true, "The body changed: 41 senses now, 37 then"],
    ]);
  });

  it("picks a brain by its run and checkpoint", () => {
    const choose = vi.fn();
    const [entry] = brainEntries([fits], undefined, choose);
    if (!entry || "divider" in entry) {
      throw new Error("no entry");
    }
    entry.run();
    expect(choose).toHaveBeenCalledWith({ runId: "run-2", step: 500 });
  });
});
