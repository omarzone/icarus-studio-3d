import type { CommunityApi } from "../community-client/community-api.ts";
import { communityApi } from "../community-client/community-api.ts";
import type { CommunityPort } from "./community-port.ts";
import { commentThreadView, creationDetailView, creationSummaryView } from "./community-views.ts";

type CatalogApi = Pick<
  CommunityApi,
  | "categories"
  | "creations"
  | "creation"
  | "vote"
  | "report"
  | "picture"
  | "comments"
  | "postComment"
  | "deleteComment"
  | "reportComment"
>;

// Browsing, voting, commenting and reporting creations on the community service; remixing also needs the engine
// (`community-remix.ts`).
export function createCommunityCatalog(
  api: CatalogApi = communityApi,
  now: () => Date = () => new Date(),
): Omit<CommunityPort, "remix"> {
  const categoryId = async (name: string | null): Promise<string | undefined> => {
    if (name === null) {
      return undefined;
    }
    const match = (await api.categories()).find((category) => category.name === name || category.id === name);
    return match?.id ?? name;
  };
  const detailOf = async (id: string) => {
    const [creation, comments] = await Promise.all([api.creation(id), api.comments(id)]);
    return creationDetailView(creation, comments);
  };
  return {
    listCategories: async () => (await api.categories()).map((category) => category.name),
    listCreations: async ({ sort, category, search, limit }) => {
      const page = await api.creations({ sort, category: await categoryId(category), q: search, limit });
      return page.items.map(creationSummaryView);
    },
    getCreation: async (id) => {
      if (id !== undefined) {
        return detailOf(id);
      }
      const first = (await api.creations({ sort: "featured", limit: 1 })).items[0];
      if (!first) {
        throw new Error("Nothing has been published to this community yet");
      }
      return detailOf(first.id);
    },
    vote: async (id) => {
      const current = await api.creation(id);
      await api.vote(id, !current.voted);
      return detailOf(id);
    },
    report: async ({ id, commentId, reason, details, blockAuthor }) => {
      const body = { reason, details, block_author: blockAuthor };
      await (commentId === undefined ? api.report(id, body) : api.reportComment(id, commentId, body));
    },
    listComments: async (creationId) => commentThreadView(await api.comments(creationId), now()),
    postComment: async ({ creationId, text }) => {
      await api.postComment(creationId, text);
    },
    deleteComment: async ({ creationId, commentId }) => {
      await api.deleteComment(creationId, commentId);
    },
    getPicture: (picture) => api.picture(picture),
  };
}
