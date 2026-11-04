import type { RouteId } from "../app/navigation/catalog-id.ts";
import type * as Api from "../community-client/community-types.ts";
import type { AvatarTone } from "../ui/avatar.tsx";
import type { AccountSummary, Profile, ProfileCreation } from "./account-port.ts";
import type {
  CommentThread,
  CommunityPerson,
  CreationAuthor,
  CreationDetail,
  CreationSummary,
  ThreadComment,
} from "./community-port.ts";
import type { AppNotification, NotificationKind } from "./notifications-port.ts";
import { relativeTime } from "./project-views.ts";
import type { NotificationSettings, PrivacySettings } from "./settings-port.ts";
import type { ShareSettings, ShareVisibility } from "./share-port.ts";

// Pure mappings from community service answers to the app's view types.

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}` : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase() || "?";
}

// The same person always gets the same avatar color.
export function toneOf(handle: string): AvatarTone {
  let hash = 0;
  for (const char of handle) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const tones: readonly AvatarTone[] = [0, 1, 2, 3, 4, 5, 6];
  return tones[hash % tones.length] ?? 0;
}

export function personView(person: Api.Person): CommunityPerson {
  return { handle: person.handle, initials: initialsOf(person.name), tone: toneOf(person.handle) };
}

function authorView(author: Api.Author): CreationAuthor {
  return { ...personView(author), name: author.name, creations: author.creations };
}

export function creationSummaryView(creation: Api.CreationSummary): CreationSummary {
  return {
    id: creation.id,
    name: creation.title,
    author: authorView(creation.author),
    category: creation.category,
    votes: creation.votes,
    remixes: creation.remixes,
    opensIn: "page",
    picture: creation.thumbnail_path,
  };
}

const PERMISSION_WORDS = [
  ["remix", "remix"],
  ["download_brain", "download the brain"],
  ["retrain", "retrain"],
  ["commercial", "commercial use"],
] as const;

export function licenseText(permissions: Api.Permissions): string {
  const allowed = PERMISSION_WORDS.filter(([key]) => permissions[key]).map(([, words]) => words);
  return allowed.length === 0 ? "View only" : `Allows ${allowed.join(", ")}`;
}

export function commentView(comment: Api.Comment, now: Date): ThreadComment {
  return {
    id: comment.id,
    author: personView(comment.author),
    text: comment.text,
    time: relativeTime(comment.created_at, now),
    canDelete: comment.can_delete,
  };
}

export function commentThreadView(page: Api.CommentPage, now: Date): CommentThread {
  return { comments: page.items.map((item) => commentView(item, now)), total: page.total, open: page.open };
}

// How many comments the overview shows under the checkpoints; the Comments tab has the rest.
export const OVERVIEW_COMMENTS = 3;

export function creationDetailView(creation: Api.CreationDetail, comments?: Api.CommentPage): CreationDetail {
  const latest = creation.versions[0];
  return {
    ...creationSummaryView(creation),
    tagline: [
      creation.category,
      latest ? `version ${latest.number}` : null,
      creation.remix_of ? `remix of ${creation.remix_of.title}` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" · "),
    description: creation.description,
    downloads: creation.downloads,
    voted: creation.voted,
    included: creation.included,
    license: licenseText(creation.permissions),
    // A bundle carries the project; training history and timelapses are not published yet.
    timelapseLength: "not published",
    checkpoints: [],
    brain: [],
    versions: creation.versions.map((version) => ({
      label: `Version ${version.number}`,
      note: version.note || `library ${version.library_version}`,
    })),
    comments: (comments?.items ?? []).slice(0, OVERVIEW_COMMENTS).map((comment) => ({
      id: comment.id,
      author: personView(comment.author),
      text: comment.text,
    })),
    commentCount: comments?.total ?? 0,
  };
}

export function accountView(profile: Api.Profile): AccountSummary {
  return {
    signedIn: true,
    name: profile.name,
    handle: profile.handle,
    initials: initialsOf(profile.name),
    tone: toneOf(profile.handle),
  };
}

export const SIGNED_OUT: AccountSummary = { signedIn: false, name: "", handle: "", initials: "", tone: 0 };

export function profileView(profile: Api.Profile): Profile {
  return {
    handle: profile.handle,
    name: profile.name,
    initials: initialsOf(profile.name),
    tone: toneOf(profile.handle),
    bio: profile.bio,
    location: profile.location,
    website: profile.website,
    signature: `${profile.name}, made with Icarus`,
    signatureOn: profile.signature_on,
    own: profile.own,
    stats: profile.stats,
    picture: profile.photo_path,
    following: profile.following,
    moderator: profile.role === "moderator",
  };
}

export function profileCreationView(creation: Api.ProfileCreation): ProfileCreation {
  // Drafts are pages not published yet; the profile shows them as private.
  const status = creation.status === "draft" ? "private" : creation.status;
  return { id: creation.id, name: creation.title, status, votes: creation.votes };
}

const NOTIFICATION_TITLES: Record<Api.NotificationItem["kind"], string> = {
  vote: "New vote",
  remix: "New remix",
  follow: "New follower",
  invite: "You were invited",
  moderation: "Moderation",
  comment: "New comment",
};

export function notificationView(item: Api.NotificationItem, now: Date): AppNotification {
  const kind: NotificationKind = item.kind;
  const opens: RouteId = item.creation_id ? "SCR-CREATION" : "SCR-PROFILE";
  const params: Record<string, string> = item.creation_id
    ? { creation: item.creation_id }
    : item.actor
      ? { user: item.actor.handle }
      : {};
  return {
    id: item.id,
    kind,
    title: NOTIFICATION_TITLES[item.kind],
    body: item.text,
    time: relativeTime(item.created_at, now),
    unread: !item.read,
    opens,
    params,
  };
}

export function privacyView(privacy: Api.Privacy): PrivacySettings {
  return {
    showCreations: privacy.show_creations,
    allowRemix: privacy.allow_remix,
    allowComments: privacy.allow_comments,
    blocked: privacy.blocked.map(personView),
  };
}

export function notificationSettingsView(settings: Api.NotificationSettings): NotificationSettings {
  return {
    runFinished: settings.run_finished,
    copilotNeedsOk: settings.copilot_needs_ok,
    remixOrComment: settings.remix_or_comment,
    communityNews: settings.community_news,
  };
}

// Public and unlisted creations both open for anyone with the link; only "unlisted" keeps it out of the catalog.
export function shareVisibilityView(visibility: Api.Visibility): ShareVisibility {
  switch (visibility) {
    case "public":
    case "unlisted":
      return "link";
    case "invited":
      return "invited";
    case "private":
      return "private";
  }
}

export function serverVisibility(next: ShareVisibility, current: Api.Visibility): Api.Visibility {
  switch (next) {
    case "link":
      return current === "public" ? "public" : "unlisted";
    case "invited":
      return "invited";
    case "private":
      return "private";
  }
}

export function shareView(share: Api.Share): ShareSettings {
  return {
    visibility: shareVisibilityView(share.visibility),
    link: share.link,
    people: share.people.map((person) => ({
      id: person.id,
      name: person.name,
      initials: initialsOf(person.name),
      detail: person.detail,
      role: person.role,
    })),
  };
}
