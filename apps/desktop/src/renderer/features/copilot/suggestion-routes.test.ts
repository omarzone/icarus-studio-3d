import { describe, expect, it } from "vitest";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { chipPlan } from "./suggestion-routes.ts";

const ROUTES = new Set<RouteId>([
  "SCR-WORLD",
  "SCR-RESULTS",
  "STA-RESULTS-FAILURES",
  "SCR-PLAY",
  "MOD-START-TRAINING",
  "MOD-STOP-RUN",
  "SCR-IDEAS",
]);
const known = (id: RouteId) => ROUTES.has(id);

describe("suggestion chips in the app", () => {
  it("open the failures of the results and ask about them to diagnose", () => {
    expect(chipPlan({ text: "Show where it fails", intent: "diagnose" }, {}, known)).toEqual({
      go: "STA-RESULTS-FAILURES",
      send: "Show where it fails",
    });
  });

  it("fall back to the next known screen of an intent", () => {
    const noFailures = (id: RouteId) => id !== "STA-RESULTS-FAILURES" && known(id);
    expect(chipPlan({ text: "Why?", intent: "diagnose" }, {}, noFailures).go).toBe("SCR-RESULTS");
  });

  it("only open the dialog or screen that does the job for train, stop and play", () => {
    expect(chipPlan({ text: "Train it", intent: "train-run" }, {}, known)).toEqual({
      go: "MOD-START-TRAINING",
      send: null,
    });
    expect(chipPlan({ text: "Stop", intent: "stop-run" }, {}, known)).toEqual({ go: "MOD-STOP-RUN", send: null });
    expect(chipPlan({ text: "Watch it", intent: "play" }, {}, known)).toEqual({ go: "SCR-PLAY", send: null });
  });

  it("open the World view and ask to show something", () => {
    expect(chipPlan({ text: "Show the car", intent: "show" }, {}, known)).toEqual({
      go: "SCR-WORLD",
      send: "Show the car",
    });
  });

  it("send questions and changes in place", () => {
    expect(chipPlan({ text: "Explain it", intent: "explain" }, {}, known)).toEqual({ go: null, send: "Explain it" });
    expect(chipPlan({ text: "Add rain", intent: "propose-change" }, {}, known)).toEqual({
      go: null,
      send: "Add rain",
    });
  });

  it("prefer the workspace's own destination when it is known", () => {
    expect(chipPlan({ text: "More ideas", intent: "new-idea" }, { "new-idea": "SCR-IDEAS" }, known)).toEqual({
      go: "SCR-IDEAS",
      send: null,
    });
    expect(chipPlan({ text: "Train", intent: "train-run" }, { "train-run": "SCR-NOWHERE" }, known).go).toBe(
      "MOD-START-TRAINING",
    );
  });
});
