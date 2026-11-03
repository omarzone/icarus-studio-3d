import type { CommunityApi } from "../community-client/community-api.ts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import type { RemixedProject } from "./community-port.ts";

type RemixApi = Pick<CommunityApi, "creation" | "bundle">;
type UnpackApi = Pick<EngineApi, "unpackBundle">;

// A project name has at most 80 characters in the engine.
const MAX_NAME = 80;

// Remixing a creation: download its latest bundle through the community bridge and let the engine make a new
// project of it. The engine records the creation as the project's lineage; publishing the project later names it
// as the original, which is how the community counts and notifies remixes.
export function createCommunityRemix(community: RemixApi, engine: UnpackApi) {
  return async (id: string): Promise<RemixedProject> => {
    const creation = await community.creation(id);
    if (!creation.permissions.remix) {
      throw new Error(`The author of ${creation.title} does not allow remixes`);
    }
    const version = Math.max(0, ...creation.versions.map((item) => item.number));
    if (version < 1) {
      throw new Error(`${creation.title} has no published version to remix`);
    }
    const bundle = await community.bundle(id);
    const state = await engine.unpackBundle({
      bundle,
      source: { creation_id: creation.id, version, title: creation.title.slice(0, 200) },
      name: creation.title.trim().slice(0, MAX_NAME) || null,
    });
    return { projectId: state.project.id, name: state.project.name };
  };
}
