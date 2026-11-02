import { describe, expect, it } from "vitest";
import { playExit } from "./play-exit.ts";

const at = (screen: `SCR-${string}`, project = "abc") => ({ screen, overlay: null, params: { project } });

describe("playExit", () => {
  it("goes back to the workspace Play was started from", () => {
    expect(playExit([at("SCR-HOME"), at("SCR-TRAIN")], "SCR-WORLD")).toEqual(at("SCR-TRAIN"));
  });

  it("skips Play itself when Play was opened twice, so Stop always leaves Play", () => {
    expect(playExit([at("SCR-TRAIN"), at("SCR-PLAY")], "SCR-WORLD")).toEqual(at("SCR-TRAIN"));
  });

  it("falls back to the workspace of the screen when nothing earlier is known, keeping the project", () => {
    expect(playExit([], "SCR-WORLD", { project: "abc" })).toEqual(at("SCR-WORLD"));
  });
});
