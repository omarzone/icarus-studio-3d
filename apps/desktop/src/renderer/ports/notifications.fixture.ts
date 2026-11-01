import type { AppNotification, NotificationsPort } from "./notifications-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
const NOTIFICATIONS: readonly AppNotification[] = [
  {
    id: "run-4-stopped",
    kind: "run-failed",
    title: "Run 4 stopped",
    body: "The physics went unstable at 41k steps.",
    time: "5 min",
    unread: false,
    opens: "STA-TRAIN-FAILED",
    params: { project: "park-pilot" },
  },
  {
    id: "park-pilot-public",
    kind: "published",
    title: "Park Pilot is public",
    body: "It passed review. 12 people saw it in the last hour.",
    time: "2 min",
    unread: true,
    opens: "SCR-CREATION",
    params: { creation: "park-pilot" },
  },
  {
    id: "run-3-finished",
    kind: "run-finished",
    title: "Run 3 finished",
    body: "Parks 71% of the time. The best brain is saved.",
    time: "40 min",
    unread: false,
    opens: "SCR-RESULTS",
    params: { project: "park-pilot" },
  },
  {
    id: "mara-remixed",
    kind: "remix",
    title: "@mara remixed Tripod Jumper",
    body: "Her version climbs stairs.",
    time: "3 h",
    unread: false,
    opens: "SCR-PROFILE",
    params: { user: "mara" },
  },
  {
    id: "dance-copy-attention",
    kind: "attention",
    title: "Dance Copy needs attention",
    body: "The spin at 0:07 loses balance.",
    time: "yesterday",
    unread: false,
    opens: "SCR-MOTION",
    params: { project: "dance-copy" },
  },
];

export function createNotificationsFixture(): NotificationsPort {
  let notifications = [...NOTIFICATIONS];
  return {
    listNotifications: async () => notifications,
    markAllRead: async () => {
      notifications = notifications.map((item) => ({ ...item, unread: false }));
    },
  };
}
