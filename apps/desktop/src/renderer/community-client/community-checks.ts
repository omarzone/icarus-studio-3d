import { has, isListOf, isRecord } from "../engine-client/response-checks.ts";
import type {
  AccountDeleted,
  Category,
  CreationDetail,
  CreationPage,
  CreationSummary,
  ModerationCounts,
  ModerationItem,
  NotificationItem,
  NotificationSettings,
  Page,
  Person,
  Privacy,
  Profile,
  ProfileCreation,
  Share,
} from "./community-types.ts";

// Structural checks of community answers: the fields the app reads, with their kinds.

const strings = (value: unknown, ...keys: string[]) => keys.every((key) => has(value, key, "string"));
const numbers = (value: unknown, ...keys: string[]) => keys.every((key) => has(value, key, "number"));
const booleans = (value: unknown, ...keys: string[]) => keys.every((key) => has(value, key, "boolean"));
const nullableString = (value: unknown, key: string) =>
  isRecord(value) && (value[key] === null || typeof value[key] === "string");

export function isPerson(value: unknown): value is Person {
  return strings(value, "handle", "name") && nullableString(value, "photo_path");
}

export function isCategory(value: unknown): value is Category {
  return strings(value, "id", "name");
}

export function isCreationSummary(value: unknown): value is CreationSummary {
  return (
    strings(value, "id", "title", "category", "status", "visibility", "thumbnail_path", "created_at") &&
    numbers(value, "votes", "remixes", "downloads") &&
    isRecord(value) &&
    isPerson(value.author) &&
    numbers(value.author, "creations")
  );
}

export function isCreationDetail(value: unknown): value is CreationDetail {
  if (!isRecord(value) || !isCreationSummary(value)) {
    return false;
  }
  const record: Record<string, unknown> = value;
  return (
    strings(record, "description") &&
    booleans(record, "voted", "can_edit") &&
    isListOf(record.included, (line): line is string => typeof line === "string") &&
    booleans(record.permissions, "remix", "download_brain", "retrain", "commercial") &&
    isListOf(
      record.versions,
      (version): version is CreationDetail["versions"][number] =>
        numbers(version, "number") && strings(version, "note", "created_at"),
    ) &&
    (record.remix_of === null || strings(record.remix_of, "id", "title"))
  );
}

export function isCreationPage(value: unknown): value is CreationPage {
  return isRecord(value) && numbers(value, "total") && isListOf(value.items, isCreationSummary);
}

export function isPage(value: unknown): value is Page {
  return (
    strings(value, "project_id", "title", "description", "visibility", "status") &&
    booleans(value, "guidelines_accepted") &&
    nullableString(value, "category") &&
    nullableString(value, "creation_id") &&
    isRecord(value) &&
    booleans(value.permissions, "remix", "download_brain", "retrain", "commercial")
  );
}

export function isProfile(value: unknown): value is Profile {
  return (
    strings(value, "handle", "name", "bio", "location", "website", "role") &&
    booleans(value, "signature_on", "own", "following") &&
    nullableString(value, "photo_path") &&
    isRecord(value) &&
    numbers(value.stats, "creations", "votes", "remixes", "followers")
  );
}

export function isProfileCreation(value: unknown): value is ProfileCreation {
  return strings(value, "id", "title", "status") && numbers(value, "votes");
}

export function isPrivacy(value: unknown): value is Privacy {
  return (
    booleans(value, "show_creations", "allow_remix", "allow_comments") &&
    isRecord(value) &&
    isListOf(value.blocked, isPerson)
  );
}

export function isNotificationSettings(value: unknown): value is NotificationSettings {
  return booleans(value, "run_finished", "copilot_needs_ok", "remix_or_comment", "community_news");
}

export function isNotificationItem(value: unknown): value is NotificationItem {
  return (
    strings(value, "id", "kind", "text", "created_at") &&
    booleans(value, "read") &&
    nullableString(value, "creation_id") &&
    isRecord(value) &&
    (value.actor === null || isPerson(value.actor))
  );
}

export function isShare(value: unknown): value is Share {
  return (
    strings(value, "project_id", "visibility", "link") &&
    isRecord(value) &&
    isListOf(value.people, (person): person is Share["people"][number] =>
      strings(person, "id", "name", "detail", "role"),
    )
  );
}

export function isModerationCounts(value: unknown): value is ModerationCounts {
  return numbers(value, "reports", "new", "banned", "appeals");
}

export function isModerationItem(value: unknown): value is ModerationItem {
  return strings(value, "id", "creation", "author", "reason", "scan") && numbers(value, "reports");
}

export function isAccountDeleted(value: unknown): value is AccountDeleted {
  return booleans(value, "deleted", "identity_deleted");
}

export const isList =
  <T>(item: (value: unknown) => value is T) =>
  (value: unknown): value is T[] =>
    isListOf(value, item);

export const isNothing = (value: unknown): value is null => value === null;

export const isAnyJson = (value: unknown): value is Record<string, unknown> => isRecord(value);
