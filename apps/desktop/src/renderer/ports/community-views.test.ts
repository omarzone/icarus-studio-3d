import { expect, it } from "vitest";
import type { NotificationItem } from "../community-client/community-types.ts";
import {
  initialsOf,
  licenseText,
  notificationView,
  profileCreationView,
  serverVisibility,
  shareVisibilityView,
  toneOf,
} from "./community-views.ts";

it("shares by link without taking a public creation out of the catalog", () => {
  expect(shareVisibilityView("public")).toBe("link");
  expect(shareVisibilityView("unlisted")).toBe("link");
  expect(serverVisibility("link", "public")).toBe("public");
  expect(serverVisibility("link", "private")).toBe("unlisted");
  expect(serverVisibility("invited", "public")).toBe("invited");
});

it("opens a notification on its creation, or on the person who caused it", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const base: NotificationItem = {
    id: "n1",
    kind: "vote",
    text: "Ben voted for Parking car",
    actor: { handle: "ben", name: "Ben", photo_path: null },
    creation_id: "c1",
    read: false,
    created_at: "2026-11-03T11:55:00Z",
  };

  expect(notificationView(base, now)).toMatchObject({
    title: "New vote",
    body: "Ben voted for Parking car",
    time: "5 min ago",
    unread: true,
    opens: "SCR-CREATION",
    params: { creation: "c1" },
  });
  expect(notificationView({ ...base, kind: "follow", creation_id: null, read: true }, now)).toMatchObject({
    opens: "SCR-PROFILE",
    params: { user: "ben" },
    unread: false,
  });
});

it("says what a creation's permissions allow", () => {
  expect(licenseText({ remix: true, download_brain: false, retrain: true, commercial: false })).toBe(
    "Allows remix, retrain",
  );
  expect(licenseText({ remix: false, download_brain: false, retrain: false, commercial: false })).toBe("View only");
});

it("shows drafts as private on a profile and keeps a person's look stable", () => {
  expect(profileCreationView({ id: "p1", title: "Draft", status: "draft", votes: 0 }).status).toBe("private");
  expect(initialsOf("Mara Ortiz")).toBe("MO");
  expect(initialsOf("ana")).toBe("AN");
  expect(toneOf("mara")).toBe(toneOf("mara"));
});
