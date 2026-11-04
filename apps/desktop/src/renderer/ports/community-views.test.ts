import { expect, it } from "vitest";
import type { CommentPage, CreationDetail, NotificationItem } from "../community-client/community-types.ts";
import {
  commentThreadView,
  creationDetailView,
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

it("counts every comment but previews only the newest ones on the overview", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const comment = (id: string, canDelete: boolean): CommentPage["items"][number] => ({
    id,
    author: { handle: "ben", name: "Ben Ruiz", photo_path: null },
    text: `Comment ${id}`,
    created_at: "2026-11-03T11:00:00Z",
    can_delete: canDelete,
  });
  const page: CommentPage = { items: ["a", "b", "c", "d"].map((id) => comment(id, id === "a")), total: 9, open: false };

  const thread = commentThreadView(page, now);
  expect(thread).toMatchObject({ total: 9, open: false });
  expect(thread.comments[0]).toMatchObject({ id: "a", time: "1 h ago", canDelete: true, author: { initials: "BR" } });
  expect(thread.comments[1]?.canDelete).toBe(false);

  const creation: CreationDetail = {
    id: "c1",
    title: "Parking car",
    category: "Cars",
    author: { handle: "ana", name: "Ana", photo_path: null, creations: 1 },
    votes: 0,
    remixes: 0,
    downloads: 0,
    status: "public",
    visibility: "public",
    thumbnail_path: "/v1/creations/c1/thumbnail",
    created_at: "2026-11-03T10:00:00Z",
    description: "",
    voted: false,
    included: [],
    permissions: { remix: true, download_brain: true, retrain: true, commercial: false },
    versions: [],
    remix_of: null,
    can_edit: false,
  };
  const detail = creationDetailView(creation, page);
  expect(detail.commentCount).toBe(9);
  expect(detail.comments.map((item) => item.id)).toEqual(["a", "b", "c"]);
});
