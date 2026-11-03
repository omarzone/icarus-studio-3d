import {
  isAccountDeleted,
  isAnyJson,
  isCategory,
  isCreationDetail,
  isCreationPage,
  isList,
  isModerationCounts,
  isModerationItem,
  isNothing,
  isNotificationItem,
  isNotificationSettings,
  isPage,
  isPrivacy,
  isProfile,
  isProfileCreation,
  isShare,
} from "./community-checks.ts";
import { communityPicture, communityRequest } from "./community-request.ts";
import type {
  ModerationQueue,
  NotificationSettings,
  PagePatch,
  Privacy,
  ProfilePatch,
  PublishRequest,
  Visibility,
} from "./community-types.ts";

const segment = (value: string) => encodeURIComponent(value);

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text === "" ? "" : `?${text}`;
}

// Typed calls to the community service API v1; every answer is checked before it is returned.
export const communityApi = {
  categories: () => communityRequest("GET", "/v1/categories", isList(isCategory)),
  creations: (input: { sort: string; category?: string; q?: string; limit?: number }) =>
    communityRequest("GET", `/v1/creations${query(input)}`, isCreationPage),
  creation: (id: string) => communityRequest("GET", `/v1/creations/${segment(id)}`, isCreationDetail),
  vote: (id: string, on: boolean) =>
    communityRequest(on ? "PUT" : "DELETE", `/v1/creations/${segment(id)}/vote`, isCreationDetail),
  report: (id: string, body: { reason: string; details: string; block_author: boolean }) =>
    communityRequest("POST", `/v1/creations/${segment(id)}/reports`, isNothing, body),
  publish: (body: PublishRequest) => communityRequest("POST", "/v1/creations", isCreationDetail, body),
  picture: (path: string) => communityPicture(path),

  me: () => communityRequest("GET", "/v1/me", isProfile),
  updateMe: (patch: ProfilePatch) => communityRequest("PATCH", "/v1/me", isProfile, patch),
  setPhoto: (image: string) => communityRequest("PUT", "/v1/me/photo", isProfile, { image }),
  removePhoto: () => communityRequest("DELETE", "/v1/me/photo", isProfile),
  profile: (handle: string) => communityRequest("GET", `/v1/profiles/${segment(handle)}`, isProfile),
  profileCreations: (handle: string, shelf: string) =>
    communityRequest("GET", `/v1/profiles/${segment(handle)}/creations${query({ shelf })}`, isList(isProfileCreation)),
  follow: (handle: string, on: boolean) =>
    communityRequest(on ? "PUT" : "DELETE", `/v1/profiles/${segment(handle)}/follow`, isProfile),

  privacy: () => communityRequest("GET", "/v1/me/privacy", isPrivacy),
  setPrivacy: (patch: Partial<Omit<Privacy, "blocked">>) =>
    communityRequest("PATCH", "/v1/me/privacy", isPrivacy, patch),
  unblock: (handle: string) => communityRequest("DELETE", `/v1/me/blocks/${segment(handle)}`, isPrivacy),
  notificationSettings: () => communityRequest("GET", "/v1/me/notification-settings", isNotificationSettings),
  setNotificationSettings: (patch: Partial<NotificationSettings>) =>
    communityRequest("PATCH", "/v1/me/notification-settings", isNotificationSettings, patch),
  notifications: () => communityRequest("GET", "/v1/me/notifications", isList(isNotificationItem)),
  markAllRead: () => communityRequest("POST", "/v1/me/notifications/read", isNothing),
  exportData: () => communityRequest("GET", "/v1/me/export", isAnyJson),
  deleteAccount: () => communityRequest("DELETE", "/v1/me", isAccountDeleted),

  page: (projectId: string) => communityRequest("GET", `/v1/me/pages/${segment(projectId)}`, isPage),
  updatePage: (projectId: string, patch: PagePatch) =>
    communityRequest("PATCH", `/v1/me/pages/${segment(projectId)}`, isPage, patch),
  share: (projectId: string) => communityRequest("GET", `/v1/me/pages/${segment(projectId)}/share`, isShare),
  setVisibility: (projectId: string, visibility: Visibility) =>
    communityRequest("PUT", `/v1/me/pages/${segment(projectId)}/share/visibility`, isShare, { visibility }),
  invite: (projectId: string, email: string) =>
    communityRequest("POST", `/v1/me/pages/${segment(projectId)}/share/invites`, isShare, { email }),
  setRole: (projectId: string, inviteId: string, role: "editor" | "viewer") =>
    communityRequest("PUT", `/v1/me/pages/${segment(projectId)}/share/invites/${segment(inviteId)}`, isShare, {
      role,
    }),

  moderationCounts: () => communityRequest("GET", "/v1/moderation/counts", isModerationCounts),
  moderationQueue: (queue: ModerationQueue) =>
    communityRequest("GET", `/v1/moderation/queue${query({ queue })}`, isList(isModerationItem)),
  decide: (body: { creation_id: string; decision: "keep" | "remove" | "ban" }) =>
    communityRequest("POST", "/v1/moderation/decisions", isNothing, body),
};

export type CommunityApi = typeof communityApi;
