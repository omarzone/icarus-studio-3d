import type { BuildIdea, IdeaSet } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { EngineError } from "../engine-client/request.ts";
import { CopilotNotConnected } from "./copilot-connection.ts";
import { createEngineIdeas } from "./ideas-engine.ts";

const set = (id: string): IdeaSet => ({ id, prompt: "a car that parks", ideas: [] });

function engine() {
  const builds: BuildIdea[] = [];
  const api = {
    createIdeas: vi.fn(async () => set("generated")),
    ideas: vi.fn(async (id: string) => set(id)),
    startBuild: vi.fn(async (body: BuildIdea) => {
      builds.push(body);
      return { build_id: "b1", project_id: null, progress: 0, steps: [], activity: "", ready: false };
    }),
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

  it("tells the views when no model is connected", async () => {
    const { ideas, api } = engine();
    api.createIdeas.mockRejectedValueOnce(new EngineError("not_connected", "Connect a model"));
    await expect(ideas.generateIdeas("a car")).rejects.toBeInstanceOf(CopilotNotConnected);
  });
});
