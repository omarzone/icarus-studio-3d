import { describe, expect, it } from "vitest";
import { compactionNote, contextRequest, contextSegments, contextTone, usedPercent } from "./context-usage-views.ts";
import type { ContextUsageView } from "./copilot-port.ts";

const usage = (used: number, change: Partial<ContextUsageView["compaction"]> = {}): ContextUsageView => ({
  model: "reasoner",
  window: 64_000,
  windowKnown: true,
  used,
  reserve: 9_600,
  free: Math.max(0, 64_000 - 9_600 - used),
  categories: [
    { part: "tools", tokens: used - 2_000, items: [] },
    { part: "summary", tokens: 0, items: [] },
    { part: "history", tokens: 2_000, items: [] },
  ],
  compaction: {
    historyTokens: 2_000,
    foldAt: 19_040,
    folding: false,
    foldsNextTurn: false,
    pruneAt: 38_080,
    ...change,
  },
});

describe("context gauge", () => {
  it("turns amber once a turn starts by shortening results and red once it reaches the answer's room", () => {
    expect(contextTone(usage(30_000))).toBe("main");
    expect(contextTone(usage(40_000))).toBe("warn");
    expect(contextTone(usage(60_000))).toBe("danger");
    expect(usedPercent(usage(30_000))).toBe(47);
    expect(usedPercent(usage(90_000))).toBe(100);
  });

  it("says when the conversation folds into the summary", () => {
    expect(compactionNote(usage(30_000))).toBe(
      "Older messages fold into a summary after about 17k more tokens of conversation.",
    );
    expect(compactionNote(usage(30_000, { folding: true }))).toMatch(/with every message now/);
    expect(compactionNote(usage(30_000, { folding: true, foldsNextTurn: true }))).toMatch(/^Your next message/);
  });

  it("draws the parts that hold something, the reserve and the free room across the window", () => {
    const segments = contextSegments(usage(30_000));
    expect(segments.map((segment) => segment.key)).toEqual(["tools", "history", "reserve", "free"]);
    expect(segments.reduce((sum, segment) => sum + segment.share, 0)).toBeCloseTo(1);
    const over = contextSegments(usage(70_000));
    expect(over.reduce((sum, segment) => sum + segment.share, 0)).toBeCloseTo(1);
    expect(over.at(-1)).toEqual({ key: "free", tokens: 0, share: 0 });
  });
});

describe("context request", () => {
  it("sends the composer's files, the renders to come and where the person is", () => {
    expect(contextRequest({ key: "park", attachments: ["a1"], sceneViews: 2, selection: "car" })).toEqual({
      scene_views: 2,
      attachments: ["a1"],
      selection: "car",
    });
    expect(contextRequest({ key: "park", sceneViews: 9 })).toEqual({ scene_views: 4 });
  });
});
