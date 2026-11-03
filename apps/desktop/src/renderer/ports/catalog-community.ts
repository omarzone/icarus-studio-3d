import type { CommunityApi } from "../community-client/community-api.ts";
import { communityApi } from "../community-client/community-api.ts";
import type { CommunityPort } from "./community-port.ts";
import { creationDetailView, creationSummaryView } from "./community-views.ts";

type CatalogApi = Pick<CommunityApi, "categories" | "creations" | "creation" | "vote" | "report" | "picture">;

// Browsing, voting and reporting creations on the community service. Remixing needs the engine to import a
// bundle, which it cannot do yet, so the port keeps that action pending.
export function createCommunityCatalog(api: CatalogApi = communityApi): Omit<CommunityPort, "remix"> {
  const categoryId = async (name: string | null): Promise<string | undefined> => {
    if (name === null) {
      return undefined;
    }
    const match = (await api.categories()).find((category) => category.name === name || category.id === name);
    return match?.id ?? name;
  };
  return {
    listCategories: async () => (await api.categories()).map((category) => category.name),
    listCreations: async ({ sort, category, search, limit }) => {
      const page = await api.creations({ sort, category: await categoryId(category), q: search, limit });
      return page.items.map(creationSummaryView);
    },
    getCreation: async (id) => {
      if (id !== undefined) {
        return creationDetailView(await api.creation(id));
      }
      const first = (await api.creations({ sort: "featured", limit: 1 })).items[0];
      if (!first) {
        throw new Error("Nothing has been published to this community yet");
      }
      return creationDetailView(await api.creation(first.id));
    },
    vote: async (id) => {
      const current = await api.creation(id);
      return creationDetailView(await api.vote(id, !current.voted));
    },
    report: async ({ id, reason, details, blockAuthor }) => {
      await api.report(id, { reason, details, block_author: blockAuthor });
    },
    getPicture: (picture) => api.picture(picture),
  };
}
