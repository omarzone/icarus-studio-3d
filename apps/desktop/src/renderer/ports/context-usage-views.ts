import type { ContextRequest, ContextUsage } from "@icarus/contracts";
import { compactNumber } from "../ui/compact-number.ts";
import type { ContextInput, ContextPart, ContextUsageView } from "./copilot-port.ts";

// The engine's context meter mapped onto what the composer gauge and its popover show.

export const PART_LABEL: Record<ContextPart, string> = {
  system: "System prompt",
  tools: "Tool definitions",
  skills: "Skills",
  memory: "Memory notes",
  project: "Project and run facts",
  summary: "Conversation summary",
  history: "Conversation",
  message: "Your next message",
  attachments: "Attachments",
};

type Ids = NonNullable<ContextRequest["attachments"]>;
// The contract caps the files of a message; the composer keeps within the cap.
const fitsAttachments = (ids: string[]): ids is Ids => ids.length <= 10;

export function contextRequest({
  attachments = [],
  sceneViews = 0,
  workspace,
  selection,
}: ContextInput): ContextRequest {
  const body: ContextRequest = { scene_views: Math.min(4, Math.max(0, sceneViews)) };
  const files = [...attachments];
  if (files.length > 0 && fitsAttachments(files)) {
    body.attachments = files;
  }
  if (workspace) {
    body.workspace = workspace;
  }
  if (selection) {
    body.selection = selection;
  }
  return body;
}

export function contextUsageView(usage: ContextUsage): ContextUsageView {
  const { compaction } = usage;
  return {
    model: usage.model,
    window: usage.window,
    windowKnown: usage.window_known,
    used: usage.used,
    reserve: usage.reserve,
    free: usage.free,
    categories: usage.categories.map((category) => ({
      part: category.part,
      tokens: category.tokens,
      items: category.items ?? [],
    })),
    compaction: {
      historyTokens: compaction.history_tokens,
      foldAt: compaction.fold_at,
      folding: compaction.folding,
      foldsNextTurn: compaction.folds_next_turn,
      pruneAt: compaction.prune_at,
    },
  };
}

export type ContextTone = "main" | "warn" | "danger";

// Amber once a turn starts by shortening its own results, red once the prompt reaches the answer's room.
export function contextTone(view: ContextUsageView): ContextTone {
  if (view.used > view.window - view.reserve) {
    return "danger";
  }
  return view.used >= view.compaction.pruneAt ? "warn" : "main";
}

export function usedPercent(view: ContextUsageView): number {
  return Math.min(100, Math.round((view.used / view.window) * 100));
}

export const tokens = (count: number) => compactNumber(Math.max(0, Math.round(count)));

// When the conversation next folds into the rolling summary, in words.
export function compactionNote(view: ContextUsageView): string {
  const { compaction } = view;
  if (compaction.foldsNextTurn) {
    return "Your next message first folds older messages into the conversation summary.";
  }
  if (compaction.folding) {
    return "Older messages fold into the conversation summary with every message now.";
  }
  const left = compaction.foldAt - compaction.historyTokens;
  return `Older messages fold into a summary after about ${tokens(left)} more tokens of conversation.`;
}

export type ContextSegment = { key: ContextPart | "reserve" | "free"; tokens: number; share: number };

// The stacked bar: each part that holds something, the answer's reserve and the free room, as shares of the window.
export function contextSegments(view: ContextUsageView): ContextSegment[] {
  const parts: ContextSegment[] = view.categories
    .filter((category) => category.tokens > 0)
    .map((category) => ({ key: category.part, tokens: category.tokens, share: 0 }));
  const all = [...parts, { key: "reserve" as const, tokens: view.reserve, share: 0 }];
  all.push({ key: "free", tokens: view.free, share: 0 });
  const total = Math.max(
    view.window,
    all.reduce((sum, segment) => sum + segment.tokens, 0),
  );
  return all.map((segment) => ({ ...segment, share: segment.tokens / total }));
}
