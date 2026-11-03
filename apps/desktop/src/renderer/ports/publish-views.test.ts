import type { ProjectState } from "@icarus/contracts";
import { expect, it } from "vitest";
import type { Page } from "../community-client/community-types.ts";
import { includedLines, projectBundle, reachText, readinessView, reviewView } from "./publish-views.ts";

const object = (id: string) => ({ id, name: id, parent: null, components: [] });

const STATE: ProjectState = {
  project: {
    id: "proj-1",
    name: "Parking car",
    schema_version: 1,
    world: { objects: [object("ground"), object("wall")] },
    bodies: [{ id: "car", name: "Car", objects: [object("chassis")] }],
    task: { family: "navigation", rewards: [] },
    brain: { copies: 16, seed: 1, template: null },
  },
  revision: { number: 3, parent: 2, author: "user", summary: "", operations: [], created_at: "2026-11-03T10:00:00Z" },
  report: { ok: false, checks: [], duration_ms: 3 },
  can_undo: true,
  can_redo: false,
};

const PAGE: Page = {
  project_id: "proj-1",
  title: "",
  description: "Parks itself",
  category: null,
  permissions: { remix: true, download_brain: true, retrain: false, commercial: false },
  visibility: "public",
  guidelines_accepted: false,
  status: "draft",
  creation_id: null,
};

it("lists what the bundle carries from the project document", () => {
  expect(includedLines(STATE)).toEqual([
    "World · 2 objects",
    "Body · Car, 1 part",
    "Task · navigation, 0 reward terms",
    "Brain settings · ppo, 16 copies",
  ]);
});

it("checks a creation honestly before it is published", () => {
  const me = {
    handle: "ana",
    name: "Ana",
    bio: "",
    location: "",
    website: "",
    photo_path: null,
    signature_on: false,
    own: true,
    following: false,
    role: "member" as const,
    stats: { creations: 0, votes: 0, remixes: 0, followers: 0 },
  };
  const readiness = readinessView(PAGE, STATE, me);

  expect(readiness.checks.map((check) => check.ok)).toEqual([true, false, true]);
  expect(readiness.author.signature).toBeNull();
  expect(readiness.reach).toBe("People can remix it and download its brain.");
  expect(reachText({ remix: false, download_brain: false, retrain: false, commercial: false })).toBe(
    "People can open it but not reuse it.",
  );
});

it("bundles the project document as data with the versions it was made with", () => {
  const bundle = projectBundle(STATE, "2026.11");

  expect(bundle).toMatchObject({
    format: "icarus.bundle",
    format_version: 1,
    kind: "project",
    contract_version: "project-1",
    library_version: "2026.11",
    lineage: { remix_of: null },
  });
  expect(bundle.project).toBe(STATE.project);
});

it("reads a removed creation as not published", () => {
  expect(reviewView({ ...PAGE, status: "public", creation_id: "c1" })).toEqual({ status: "public", creationId: "c1" });
  expect(reviewView({ ...PAGE, status: "removed", creation_id: "c1" }).status).toBe("draft");
});
