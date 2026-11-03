import { expect, it } from "vitest";
import { isContextUsage } from "./context-usage-checks.ts";

const usage = {
  capability: "vision",
  model: null,
  window: 64_000,
  window_known: false,
  used: 4_000,
  reserve: 9_600,
  free: 50_400,
  categories: [{ part: "attachments", tokens: 1_520, items: [{ label: "car.png", tokens: 1_520 }] }],
  compaction: { history_tokens: 0, fold_at: 19_040, folding: false, folds_next_turn: false, prune_at: 38_080 },
};

it("takes the meter's answer and refuses one with an unknown part or without compaction facts", () => {
  expect(isContextUsage(usage)).toBe(true);
  expect(isContextUsage({ ...usage, categories: [{ part: "secrets", tokens: 1 }] })).toBe(false);
  expect(isContextUsage({ ...usage, compaction: undefined })).toBe(false);
  expect(isContextUsage({ ...usage, model: 3 })).toBe(false);
});
