import type { SceneDescription } from "@icarus/contracts";
import type { CommunityApi } from "../community-client/community-api.ts";
import { communityApi } from "../community-client/community-api.ts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import { engineApi } from "../engine-client/engine-api.ts";
import type { PublishPort } from "./publish-port.ts";
import {
  communityPageView,
  defaultCategory,
  includedLines,
  permissionField,
  projectBundle,
  readinessView,
  reviewView,
} from "./publish-views.ts";

type PublishApi = Pick<CommunityApi, "page" | "updatePage" | "me" | "publish" | "creation" | "categories">;
type ProjectApi = Pick<EngineApi, "project" | "scene" | "library">;

async function renderThumbnail(scene: SceneDescription): Promise<string> {
  const { renderSceneThumbnail } = await import("../scene/thumbnail-renderer.ts");
  return renderSceneThumbnail(scene);
}

// Publishing a project: its page lives on the community service; the bundle is the engine's project document and
// the thumbnail a still of its compiled scene. The service checks both again before it stores them.
export function createCommunityPublish(
  api: PublishApi = communityApi,
  engine: ProjectApi = engineApi,
  thumbnail: (scene: SceneDescription) => Promise<string> = renderThumbnail,
): PublishPort {
  const categoryName = async (id: string | null) =>
    (await api.categories()).find((category) => category.id === id)?.name ?? "not categorized";
  const page = async (project: string) => {
    const [current, state] = await Promise.all([api.page(project), engine.project(project)]);
    return { current, state };
  };
  return {
    getCommunityPage: async (project) => {
      const [{ current, state }, me] = await Promise.all([page(project), api.me()]);
      const votes = current.creation_id ? (await api.creation(current.creation_id)).votes : 0;
      return communityPageView(current, state, me.name, await categoryName(current.category), votes);
    },
    updateCommunityPage: async ({ project, title, description, permission }) => {
      const updated = await api.updatePage(project, {
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
        ...(permission ? { permissions: { [permissionField(permission.id)]: permission.on } } : {}),
      });
      const [state, me] = await Promise.all([engine.project(project), api.me()]);
      return communityPageView(updated, state, me.name, await categoryName(updated.category), 0);
    },
    saveDraft: async (project) => {
      const { current, state } = await page(project);
      await api.updatePage(project, {
        title: current.title || state.project.name,
        ...(current.category ? {} : { category: defaultCategory(state) }),
      });
    },
    getReadiness: async (project) => {
      const [{ current, state }, me] = await Promise.all([page(project), api.me()]);
      return readinessView(current, state, me);
    },
    acceptGuidelines: async ({ project, accepted }) => {
      const updated = await api.updatePage(project, { guidelines_accepted: accepted });
      const [state, me] = await Promise.all([engine.project(project), api.me()]);
      return readinessView(updated, state, me);
    },
    publish: async (project) => {
      const { current, state } = await page(project);
      if (!state.report.ok) {
        throw new Error("The design does not pass its physical tests yet; fix it before publishing");
      }
      await api.updatePage(project, {
        title: current.title || state.project.name,
        ...(current.category ? {} : { category: defaultCategory(state) }),
      });
      const [scene, library] = await Promise.all([engine.scene(project), engine.library()]);
      const creation = await api.publish({
        project_id: project,
        bundle: projectBundle(state, library.version),
        thumbnail: await thumbnail(scene),
        included: includedLines(state),
      });
      return { status: creation.status === "public" ? "public" : "review", creationId: creation.id };
    },
    getReview: async (project) => reviewView(await api.page(project)),
  };
}
