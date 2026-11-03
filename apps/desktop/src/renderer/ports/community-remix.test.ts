import type { ProjectState, UnpackBundle } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import type { CreationDetail } from "../community-client/community-types.ts";
import { isProject } from "../engine-client/response-checks.ts";
import { createCommunityRemix } from "./community-remix.ts";
import parking from "./testdata/parking-car.json";

const project = (() => {
  if (!isProject(parking.project)) {
    throw new Error("bad test data");
  }
  return parking.project;
})();

const CREATION: CreationDetail = {
  id: "c42",
  title: "Valet Bot",
  category: "robots",
  author: { handle: "mara", name: "Mara", photo_path: null, creations: 3 },
  votes: 10,
  remixes: 1,
  downloads: 5,
  status: "public",
  visibility: "public",
  thumbnail_path: "/v1/creations/c42/thumbnail",
  created_at: "2026-11-01T10:00:00Z",
  description: "Parks between the cones",
  voted: false,
  included: [],
  permissions: { remix: true, download_brain: false, retrain: true, commercial: false },
  versions: [
    { number: 1, note: "", contract_version: "project-1", library_version: "6", created_at: "2026-11-01T10:00:00Z" },
    { number: 2, note: "", contract_version: "project-1", library_version: "6", created_at: "2026-11-02T10:00:00Z" },
  ],
  remix_of: null,
  can_edit: false,
};

const BUNDLE = { format: "icarus.bundle", format_version: 1, kind: "project", project };

function remixWith(creation: CreationDetail) {
  const bundle = vi.fn(async () => BUNDLE);
  const unpackBundle = vi.fn(
    async (body: UnpackBundle): Promise<ProjectState> => ({
      project: { ...project, id: "0123456789ab", name: body.name ?? project.name },
      revision: {
        number: 1,
        parent: null,
        author: "user",
        summary: "Remixed",
        operations: [],
        created_at: "",
        restored_from: null,
      },
      report: { ok: true, checks: [], duration_ms: 1 },
      can_undo: false,
      can_redo: false,
      remix_of: body.source,
    }),
  );
  const remix = createCommunityRemix({ creation: async () => creation, bundle }, { unpackBundle });
  return { remix, bundle, unpackBundle };
}

describe("remixing a community creation", () => {
  it("sends the downloaded bundle to the engine with the creation and version it came from", async () => {
    const { remix, unpackBundle } = remixWith(CREATION);
    expect(await remix("c42")).toEqual({ projectId: "0123456789ab", name: "Valet Bot" });
    expect(unpackBundle).toHaveBeenCalledWith({
      bundle: BUNDLE,
      source: { creation_id: "c42", version: 2, title: "Valet Bot" },
      name: "Valet Bot",
    });
  });

  it("refuses before downloading when the author does not allow remixes", async () => {
    const closed = { ...CREATION, permissions: { ...CREATION.permissions, remix: false } };
    const { remix, bundle, unpackBundle } = remixWith(closed);
    await expect(remix("c42")).rejects.toThrow(/does not allow remixes/);
    expect(bundle).not.toHaveBeenCalled();
    expect(unpackBundle).not.toHaveBeenCalled();
  });
});
