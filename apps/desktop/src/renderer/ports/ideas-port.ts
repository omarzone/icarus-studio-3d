import type { SceneDescription } from "@icarus/contracts";
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
  // Where the design came from ("Designed from scratch", "Built on the Walker template"); sample ideas have none.
  source?: string;
};

export type IdeaFilter = "whole" | "worlds" | "bodies";

// The mix the bar proposes: the ideas' titles to show, and their ids for the engine.
export type IdeaMix = { worldFrom: string; bodyFrom: string; worldIdea: string; bodyIdea: string };

// `prompt` is what the person asked for; sample sets have none.
export type IdeaSet = { id: string; ideas: readonly Idea[]; mix: IdeaMix | null; prompt?: string };

export type IdeasPort = {
  // Asks the copilot for ideas from a description; the set is then read by its id.
  generateIdeas: (prompt: string) => Promise<IdeaSet>;
  // The set the route names, or the latest generated one when it names none.
  getIdeas: (input: { set: string | null; filter: IdeaFilter }) => Promise<IdeaSet>;
  // Starts building a project from an idea and answers the build to follow.
  useIdea: (input: { set: string; idea: string }) => Promise<{ build: string }>;
  // The copilot revises one idea with the person's words and tests it again; answers the set with it changed.
  tweakIdea: (input: { set: string; idea: string; words: string }) => Promise<IdeaSet>;
  // Builds the world of one idea with the body of another and answers the build to follow.
  mixAndBuild: (input: { set: string; mix: IdeaMix }) => Promise<{ build: string }>;
};

export const ideasPort = definePort<IdeasPort>({
  app: createEngineIdeas(),
  prototype: createIdeasFixture,
});
