import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createIdeasFixture } from "./ideas.fixture.ts";

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
};

export type IdeaFilter = "whole" | "worlds" | "bodies";

export type IdeaMix = { worldFrom: string; bodyFrom: string };

export type IdeaSet = { ideas: readonly Idea[]; mix: IdeaMix | null };

export type IdeasPort = {
  getIdeas: (input: { filter: IdeaFilter }) => Promise<IdeaSet>;
  useIdea: (id: string) => Promise<void>;
  tweakIdea: (id: string) => Promise<void>;
  mixAndBuild: (mix: IdeaMix) => Promise<void>;
};

export const ideasPort = definePort<IdeasPort>({
  app: {
    getIdeas: pending({
      key: "ideas.list",
      summary: "Ideas generated from your description",
      sprint: 6,
      ids: ["SCR-IDEAS"],
    }),
    useIdea: pending({ key: "ideas.use", summary: "Building a project from an idea", sprint: 6, ids: ["SCR-IDEAS"] }),
    tweakIdea: pending({ key: "ideas.tweak", summary: "Tweaking an idea", sprint: 6, ids: ["SCR-IDEAS"] }),
    mixAndBuild: pending({ key: "ideas.mix", summary: "Mixing parts of two ideas", sprint: 6, ids: ["SCR-IDEAS"] }),
  },
  prototype: createIdeasFixture,
});
