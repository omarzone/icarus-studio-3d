import type { SceneDescription } from "@icarus/contracts";
import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createIdeasFixture } from "./ideas.fixture.ts";
import { createEngineIdeas } from "./ideas-engine.ts";

// Alternatives the copilot generates for an idea before anything is built; previews are real 3D renders.
export type Idea = {
  id: string;
  title: string;
  world: string;
  body: string;
  learns: string;
  // Estimated training time on this computer ("about 40 min").
  estimate: string;
  recommended: boolean;
  // The idea compiled by the engine, drawn as its preview; none for sample ideas.
  scene: SceneDescription | null;
};

export type IdeaFilter = "whole" | "worlds" | "bodies";

export type IdeaMix = { worldFrom: string; bodyFrom: string };

export type IdeaSet = { id: string; ideas: readonly Idea[]; mix: IdeaMix | null };

export type IdeasPort = {
  // Asks the copilot for ideas from a description; the set is then read by its id.
  generateIdeas: (prompt: string) => Promise<IdeaSet>;
  // The set the route names, or the latest generated one when it names none.
  getIdeas: (input: { set: string | null; filter: IdeaFilter }) => Promise<IdeaSet>;
  // Starts building a project from an idea and answers the build to follow.
  useIdea: (input: { set: string; idea: string }) => Promise<{ build: string }>;
  tweakIdea: (id: string) => Promise<void>;
  mixAndBuild: (mix: IdeaMix) => Promise<void>;
};

export const ideasPort = definePort<IdeasPort>({
  app: {
    ...createEngineIdeas(),
    tweakIdea: pending({ key: "ideas.tweak", summary: "Tweaking an idea", sprint: 6, ids: ["SCR-IDEAS"] }),
    mixAndBuild: pending({ key: "ideas.mix", summary: "Mixing parts of two ideas", sprint: 6, ids: ["SCR-IDEAS"] }),
  },
  prototype: createIdeasFixture,
});
