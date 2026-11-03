import { definePort } from "../app/runtime/port.tsx";
import { communityApi } from "../community-client/community-api.ts";
import { engineApi } from "../engine-client/engine-api.ts";
import type { AvatarTone } from "../ui/avatar.tsx";
import { createCommunityCatalog } from "./catalog-community.ts";
import { createCommunityFixture } from "./community.fixture.ts";
import { createCommunityRemix } from "./community-remix.ts";

export type CreationSort = "featured" | "recent" | "most-voted";

export type CommunityPerson = { handle: string; initials: string; tone: AvatarTone };

export type CreationAuthor = CommunityPerson & { name: string; creations: number };

export type CreationSummary = {
  id: string;
  name: string;
  author: CreationAuthor;
  category: string;
  votes: number;
  remixes: number;
  // Reference brains open straight into the brain workspace instead of a creation page.
  opensIn: "page" | "brain";
  // Where the community keeps its picture (read with `getPicture`), or null for sample data.
  picture: string | null;
};

export type CreationComment = { id: string; author: CommunityPerson; text: string };

export type CreationDetail = CreationSummary & {
  // One line under the title ("Car · parks 93% of the time · 4M steps").
  tagline: string;
  description: string;
  downloads: number;
  voted: boolean;
  included: string[];
  license: string;
  timelapseLength: string;
  checkpoints: string[];
  brain: string[];
  versions: { label: string; note: string }[];
  comments: CreationComment[];
  commentCount: number;
};

export type ReportReason = "offensive" | "stolen" | "spam" | "harmful" | "other";

export type CreationReport = { id: string; reason: ReportReason; details: string; blockAuthor: boolean };

export type CreationQuery = { sort: CreationSort; category: string | null; search: string; limit?: number };

export type RemixedProject = { projectId: string; name: string };

export type CommunityPort = {
  listCategories: () => Promise<string[]>;
  listCreations: (query: CreationQuery) => Promise<CreationSummary[]>;
  // Without an id, the creation the community features first.
  getCreation: (id: string | undefined) => Promise<CreationDetail>;
  vote: (id: string) => Promise<CreationDetail>;
  // Makes a new local project of the creation's latest version, remembering where it came from.
  remix: (id: string) => Promise<RemixedProject>;
  report: (report: CreationReport) => Promise<void>;
  // A creation's or person's picture as a data URL, or null when there is none.
  getPicture: (picture: string) => Promise<string | null>;
};

export const communityPort = definePort<CommunityPort>({
  app: { ...createCommunityCatalog(), remix: createCommunityRemix(communityApi, engineApi) },
  prototype: createCommunityFixture,
});
