import type { ProjectState } from "@icarus/contracts";
import type * as Api from "../community-client/community-types.ts";
import { initialsOf, toneOf } from "./community-views.ts";
import type { CommunityPage, PublishPermissionId, PublishReadiness, PublishReview } from "./publish-port.ts";

// Pure mappings for publishing a project: the bundle it becomes, its page, its checks and its review.

export const BUNDLE_FORMAT = "icarus.bundle";

const PERMISSIONS: readonly { id: PublishPermissionId; field: keyof Api.Permissions; label: string }[] = [
  { id: "remix", field: "remix", label: "Remix" },
  { id: "download-brain", field: "download_brain", label: "Download brain" },
  { id: "retrain", field: "retrain", label: "Retrain" },
  { id: "commercial", field: "commercial", label: "Commercial use" },
];

export function permissionField(id: PublishPermissionId): keyof Api.Permissions {
  return PERMISSIONS.find((permission) => permission.id === id)?.field ?? "remix";
}

const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

// One line per part of the project the bundle carries, from the project document itself.
export function includedLines(state: ProjectState): string[] {
  const { project } = state;
  const lines = [`World · ${plural(project.world.objects.length, "object")}`];
  for (const body of project.bodies) {
    lines.push(`Body · ${body.name}, ${plural(body.objects.length, "part")}`);
  }
  if (project.task.family !== "none") {
    lines.push(`Task · ${project.task.family}, ${plural(project.task.rewards.length, "reward term")}`);
  }
  lines.push(`Brain settings · ${project.brain.algorithm ?? "ppo"}, ${plural(project.brain.copies, "copy", "copies")}`);
  return lines;
}

// The community has no category picker yet: a project without bodies is a world, anything else a robot.
export function defaultCategory(state: ProjectState): string {
  return state.project.bodies.length === 0 ? "worlds" : "robots";
}

export function communityPageView(
  page: Api.Page,
  state: ProjectState,
  author: string,
  categoryName: string,
  votes: number,
): CommunityPage {
  return {
    title: page.title || state.project.name,
    description: page.description,
    permissions: PERMISSIONS.map(({ id, field, label }) => ({ id, label, on: page.permissions[field] })),
    included: includedLines(state),
    preview: { byline: `by ${author} · ${categoryName}`, votes },
  };
}

export function reachText(permissions: Api.Permissions): string {
  const can = [
    permissions.remix ? "remix it" : null,
    permissions.download_brain ? "download its brain" : null,
    permissions.retrain ? "retrain it" : null,
    permissions.commercial ? "use it commercially" : null,
  ].filter((part): part is string => part !== null);
  if (can.length === 0) {
    return "People can open it but not reuse it.";
  }
  const last = can.pop();
  return `People can ${can.length > 0 ? `${can.join(", ")} and ${last}` : last}.`;
}

export function readinessView(page: Api.Page, state: ProjectState, me: Api.Profile): PublishReadiness {
  const title = page.title || state.project.name;
  return {
    author: {
      name: me.name,
      handle: me.handle,
      initials: initialsOf(me.name),
      tone: toneOf(me.handle),
      signature: me.signature_on ? `${me.name}, made with Icarus` : null,
    },
    reach: reachText(page.permissions),
    checks: [
      { text: "Title and description written", ok: title.trim() !== "" && page.description.trim() !== "" },
      { text: "The design passes its physical tests", ok: state.report.ok },
      { text: "Project data only, no code; the community checks it again", ok: true },
    ],
    guidelinesAccepted: page.guidelines_accepted,
  };
}

export function reviewView(page: Api.Page): PublishReview {
  switch (page.status) {
    case "public":
      return { status: "public", creationId: page.creation_id };
    case "review":
      return { status: "review", creationId: page.creation_id };
    case "draft":
    case "removed":
      return { status: "draft", creationId: page.creation_id };
  }
}

// The shareable bundle: the project document with the versions it was made with; data only, never code.
// A remixed project names the creation it came from, so the community records the remix and credits its author.
export function projectBundle(state: ProjectState, libraryVersion: string): Record<string, unknown> {
  return {
    format: BUNDLE_FORMAT,
    format_version: 1,
    kind: "project",
    contract_version: `project-${state.project.schema_version}`,
    library_version: libraryVersion.slice(0, 32) || "unknown",
    created_with: "Icarus Studio 3D",
    lineage: { remix_of: state.remix_of?.creation_id ?? null },
    project: state.project,
  };
}
