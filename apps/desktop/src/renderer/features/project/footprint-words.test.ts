import { expect, it } from "vitest";
import { deleteConsequences, runsSwitchLabel } from "./footprint-words.ts";

const PUBLISHED = " Copies you published stay in the community until you remove them there.";

it("says a project without runs is simply deleted", () => {
  const none = { trainingRuns: 0, runsBytes: null, runsFollowProject: false };
  expect(deleteConsequences("Lot", none)).toBe(`Lot is deleted from this computer.${PUBLISHED}`);
  expect(runsSwitchLabel(none)).toBe("Training runs and timelapses");
});

it("says the runs and their size go with the project when they do", () => {
  const measured = { trainingRuns: 3, runsBytes: 1.8e9, runsFollowProject: true };
  expect(deleteConsequences("Lot", measured)).toBe(
    `Lot and its 3 training runs (1.8 GB) are deleted from this computer.${PUBLISHED}`,
  );
  expect(runsSwitchLabel(measured)).toBe("Training runs and timelapses · 1.8 GB");
});

it("says the runs stay behind when deleting or duplicating leaves them where they are", () => {
  const kept = { trainingRuns: 1, runsBytes: null, runsFollowProject: false };
  expect(deleteConsequences("Lot", kept)).toBe(
    `Lot is deleted from this computer. Its 1 training run stays in the runs folder.${PUBLISHED}`,
  );
  expect(runsSwitchLabel(kept)).toBe("Training runs and timelapses · 1 run stays with the original");
  expect(runsSwitchLabel({ ...kept, trainingRuns: 2 })).toBe(
    "Training runs and timelapses · 2 runs stay with the original",
  );
});
