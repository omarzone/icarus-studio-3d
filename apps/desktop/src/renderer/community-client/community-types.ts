// Answers of the community service API v1 (`services/community/src/icarus_community/schemas`), as JSON sends them.
// The service is a separate app with its own contract; `community-checks.ts` verifies each answer at the boundary.

export type Visibility = "public" | "unlisted" | "invited" | "private";

export type Person = { handle: string; name: string; photo_path: string | null };

export type Author = Person & { creations: number };

export type Category = { id: string; name: string };

export type Permissions = { remix: boolean; download_brain: boolean; retrain: boolean; commercial: boolean };

export type CreationSummary = {
  id: string;
  title: string;
  category: string;
  author: Author;
  votes: number;
  remixes: number;
  downloads: number;
  status: "review" | "public" | "removed";
  visibility: Visibility;
  thumbnail_path: string;
  created_at: string;
};

export type VersionInfo = {
  number: number;
  note: string;
  contract_version: string;
  library_version: string;
  created_at: string;
};

export type CreationDetail = CreationSummary & {
  description: string;
  voted: boolean;
  included: string[];
  permissions: Permissions;
  versions: VersionInfo[];
  remix_of: { id: string; title: string } | null;
  can_edit: boolean;
};

export type CreationPage = { items: CreationSummary[]; total: number };

export type Page = {
  project_id: string;
  title: string;
  description: string;
  category: string | null;
  permissions: Permissions;
  visibility: Visibility;
  guidelines_accepted: boolean;
  status: "draft" | "review" | "public" | "removed";
  creation_id: string | null;
};

export type PagePatch = {
  title?: string;
  description?: string;
  category?: string;
  permissions?: Partial<Permissions>;
  guidelines_accepted?: boolean;
};

export type Profile = {
  handle: string;
  name: string;
  bio: string;
  location: string;
  website: string;
  photo_path: string | null;
  signature_on: boolean;
  own: boolean;
  following: boolean;
  role: "member" | "moderator";
  stats: { creations: number; votes: number; remixes: number; followers: number };
};

export type ProfilePatch = Partial<Pick<Profile, "name" | "handle" | "bio" | "location" | "website" | "signature_on">>;

export type ProfileCreation = {
  id: string;
  title: string;
  status: "draft" | "review" | "public" | "private";
  votes: number;
};

export type Privacy = { show_creations: boolean; allow_remix: boolean; allow_comments: boolean; blocked: Person[] };

export type NotificationSettings = {
  run_finished: boolean;
  copilot_needs_ok: boolean;
  remix_or_comment: boolean;
  community_news: boolean;
};

export type NotificationItem = {
  id: string;
  kind: "vote" | "remix" | "follow" | "invite" | "moderation";
  text: string;
  actor: Person | null;
  creation_id: string | null;
  read: boolean;
  created_at: string;
};

export type Collaborator = { id: string; name: string; detail: string; role: "owner" | "editor" | "viewer" };

export type Share = { project_id: string; visibility: Visibility; link: string; people: Collaborator[] };

export type ModerationQueue = "reports" | "new" | "banned" | "appeals";

export type ModerationCounts = Record<ModerationQueue, number>;

export type ModerationItem = {
  id: string;
  creation: string;
  author: string;
  reason: string;
  reports: number;
  scan: string;
};

export type AccountDeleted = { deleted: boolean; identity_deleted: boolean };

export type PublishRequest = {
  project_id: string;
  bundle: Record<string, unknown>;
  thumbnail: string;
  note?: string;
  included: string[];
};
