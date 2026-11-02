import { type EngineApi, engineApi } from "../engine-client/engine-api.ts";
import { withCopilot } from "./copilot-connection.ts";
import type { IdeasPort } from "./ideas-port.ts";
import { ideaSetView } from "./ideas-views.ts";

// Ideas on the engine: the copilot's architect generates compiled ideas; using one starts a build.

type IdeasApi = Pick<EngineApi, "createIdeas" | "ideas" | "startBuild">;

export type EngineIdeas = Pick<IdeasPort, "generateIdeas" | "getIdeas" | "useIdea">;

export function createEngineIdeas(api: IdeasApi = engineApi): EngineIdeas {
  let latest: string | null = null;
  return {
    generateIdeas: async (prompt) => {
      const set = await withCopilot(api.createIdeas(prompt));
      latest = set.id;
      return ideaSetView(set);
    },
    // Filters by part arrive with mixing ideas; the engine's sets are whole ideas.
    getIdeas: async ({ set }) => {
      const id = set ?? latest;
      if (!id) {
        return { id: "", ideas: [], mix: null };
      }
      return ideaSetView(await withCopilot(api.ideas(id)));
    },
    useIdea: async ({ set, idea }) => {
      const status = await withCopilot(api.startBuild({ idea_set: set, idea }));
      return { build: status.build_id };
    },
  };
}
