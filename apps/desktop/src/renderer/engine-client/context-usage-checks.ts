import type { ContextCategory, ContextCompaction, ContextItem, ContextUsage } from "@icarus/contracts";
import { has, isListOf, isRecord } from "./response-checks.ts";

// Structural check of the context meter's answer: the fields the composer gauge and its popover read.

const PARTS: readonly string[] = [
  "system",
  "tools",
  "skills",
  "memory",
  "project",
  "summary",
  "history",
  "message",
  "attachments",
];
const CAPABILITIES: readonly string[] = ["reasoning", "vision", "image", "pose"];

function isItem(value: unknown): value is ContextItem {
  return isRecord(value) && has(value, "label", "string") && has(value, "tokens", "number");
}

function isCategory(value: unknown): value is ContextCategory {
  return (
    isRecord(value) &&
    typeof value.part === "string" &&
    PARTS.includes(value.part) &&
    has(value, "tokens", "number") &&
    (value.items === undefined || isListOf(value.items, isItem))
  );
}

function isCompaction(value: unknown): value is ContextCompaction {
  return (
    isRecord(value) &&
    has(value, "history_tokens", "number") &&
    has(value, "fold_at", "number") &&
    has(value, "folding", "boolean") &&
    has(value, "folds_next_turn", "boolean") &&
    has(value, "prune_at", "number")
  );
}

export function isContextUsage(value: unknown): value is ContextUsage {
  return (
    isRecord(value) &&
    typeof value.capability === "string" &&
    CAPABILITIES.includes(value.capability) &&
    (value.model === null || typeof value.model === "string") &&
    has(value, "window", "number") &&
    has(value, "window_known", "boolean") &&
    has(value, "used", "number") &&
    has(value, "reserve", "number") &&
    has(value, "free", "number") &&
    isListOf(value.categories, isCategory) &&
    isCompaction(value.compaction)
  );
}
