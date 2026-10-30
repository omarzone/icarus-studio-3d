import type { RouteId } from "../app/navigation/catalog-id.ts";
import type { RouteParams } from "../app/navigation/navigation-store.tsx";
import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createNotificationsFixture } from "./notifications.fixture.ts";

export type NotificationKind = "run-failed" | "published" | "run-finished" | "remix" | "attention";

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

export const notificationsPort = definePort<NotificationsPort>({
  app: {
    listNotifications: pending({
      key: "notifications.list",
      summary: "Notifications",
      sprint: 13,
      ids: ["POP-NOTIFICATIONS"],
    }),
    markAllRead: pending({
      key: "notifications.mark-all-read",
      summary: "Marking notifications read",
      sprint: 13,
      ids: ["POP-NOTIFICATIONS"],
    }),
  },
  prototype: createNotificationsFixture,
});
