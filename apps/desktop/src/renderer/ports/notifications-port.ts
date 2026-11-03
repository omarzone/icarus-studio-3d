import type { RouteId } from "../app/navigation/catalog-id.ts";
import type { RouteParams } from "../app/navigation/navigation-store.tsx";
import { definePort } from "../app/runtime/port.tsx";
import type { CommunityApi } from "../community-client/community-api.ts";
import { communityApi } from "../community-client/community-api.ts";
import { notificationView } from "./community-views.ts";
import { createNotificationsFixture } from "./notifications.fixture.ts";

export type NotificationKind =
  | "run-failed"
  | "published"
  | "run-finished"
  | "remix"
  | "attention"
  | "vote"
  | "follow"
  | "invite"
  | "moderation";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  // Relative time as shown ("5 min", "yesterday").
  time: string;
  unread: boolean;
  // Where opening it leads, with the project or creation it is about.
  opens: RouteId;
  params: RouteParams;
};

export type NotificationsPort = {
  listNotifications: () => Promise<AppNotification[]>;
  markAllRead: () => Promise<void>;
};

// Community notifications: votes, remixes, follows, invitations and moderation results for the signed-in person.
export function createCommunityNotifications(
  api: Pick<CommunityApi, "notifications" | "markAllRead"> = communityApi,
  now: () => Date = () => new Date(),
): NotificationsPort {
  return {
    listNotifications: async () => (await api.notifications()).map((item) => notificationView(item, now())),
    markAllRead: async () => {
      await api.markAllRead();
    },
  };
}

export const notificationsPort = definePort<NotificationsPort>({
  app: createCommunityNotifications(),
  prototype: createNotificationsFixture,
});
