import type { BuildIdea, IdeaSet, MixIdeas, TweakIdea } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { EngineError } from "../engine-client/request.ts";
import { CopilotNotConnected } from "./copilot-connection.ts";
import { createEngineIdeas } from "./ideas-engine.ts";

const set = (id: string): IdeaSet => ({ id, prompt: "a car that parks", ideas: [] });
const building = { build_id: "b1", project_id: null, progress: 0, steps: [], activity: "", ready: false };

function engine() {
  const builds: BuildIdea[] = [];
  const api = {
    createIdeas: vi.fn(async () => set("generated")),
    ideas: vi.fn(async (id: string) => set(id)),
    startBuild: vi.fn(async (body: BuildIdea) => {
      builds.push(body);
      return building;
    }),
    tweakIdea: vi.fn(async (id: string, _idea: string, _body: TweakIdea) => set(id)),
    mixIdeas: vi.fn(async (_set: string, _body: MixIdeas) => building),
  };
  return { ideas: createEngineIdeas(api), api, builds };
}

describe("ideas on the engine", () => {
  it("reads the set the route names", async () => {
    const { ideas } = engine();
    expect((await ideas.getIdeas({ set: "s7", filter: "whole" })).id).toBe("s7");
  });

  it("falls back to the latest generated set, and to none before any", async () => {
    const { ideas } = engine();
    expect((await ideas.getIdeas({ set: null, filter: "whole" })).ideas).toEqual([]);
    await ideas.generateIdeas("a car that parks");
    expect((await ideas.getIdeas({ set: null, filter: "whole" })).id).toBe("generated");
  });

  it("starts a build of the chosen idea from its set", async () => {
    const { ideas, builds } = engine();
    expect(await ideas.useIdea({ set: "s7", idea: "classic" })).toEqual({ build: "b1" });
    expect(builds).toEqual([{ idea_set: "s7", idea: "classic" }]);
  });

  it("asks the copilot to tweak one idea with the person's words", async () => {
    const { ideas, api } = engine();
    expect((await ideas.tweakIdea({ set: "s7", idea: "classic", words: "make it heavier" })).id).toBe("s7");
    expect(api.tweakIdea).toHaveBeenCalledWith("s7", "classic", { words: "make it heavier" });
  });

  it("builds the world of one idea with the body of another", async () => {
    const { ideas, api } = engine();
    const mix = { worldFrom: "Street", bodyFrom: "Classic", worldIdea: "street", bodyIdea: "classic" };
    expect(await ideas.mixAndBuild({ set: "s7", mix })).toEqual({ build: "b1" });
    expect(api.mixIdeas).toHaveBeenCalledWith("s7", { world_from: "street", body_from: "classic" });
  });

  it("tells the views when no model is connected", async () => {
    const { ideas, api } = engine();
    api.createIdeas.mockRejectedValueOnce(new EngineError("not_connected", "Connect a model"));
    await expect(ideas.generateIdeas("a car")).rejects.toBeInstanceOf(CopilotNotConnected);
  });
});
