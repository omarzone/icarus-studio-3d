import type { ChatAttachment, ChatMessage, ContextCategoryView, ContextUsageView } from "./copilot-port.ts";

// Sample context meter for the prototype: fixed instruction sizes and the sample conversation counted like the
// engine does (about four characters per token, 1,500 per picture).

const WINDOW = 64_000;
const RESERVE = 9_600;
const PICTURE = 1_500;
const TOOLS = [
  { label: "try", tokens: 3_000 },
  { label: "build_object", tokens: 2_900 },
  { label: "layout", tokens: 2_100 },
  { label: "propose", tokens: 1_200 },
  { label: "look", tokens: 850 },
  { label: "answer", tokens: 1_400 },
];
const SKILLS = [
  { label: "How skills are used", tokens: 50 },
  { label: "build-an-environment: Lay out a whole place from a recipe", tokens: 80 },
  { label: "avoid-obstacles: Teach any body to steer around obstacles", tokens: 60 },
];
const PROJECT = [
  { label: "Objects", tokens: 900 },
  { label: "Library", tokens: 300 },
  { label: "Task", tokens: 50 },
];

const sum = (items: readonly { tokens: number }[]) => items.reduce((total, item) => total + item.tokens, 0);
const textTokens = (text: string) => Math.floor(text.length / 4) + 1;

function messageText(message: ChatMessage): string {
  switch (message.role) {
    case "user":
    case "milestone":
      return message.text;
    case "copilot":
      return message.text.map((part) => part.text).join("");
    default:
      return "";
  }
}

export function sampleContextUsage(
  messages: readonly ChatMessage[],
  attachments: readonly ChatAttachment[],
  sceneViews: number,
): ContextUsageView {
  const spoken = messages.map(messageText).filter((text) => text.length > 0);
  const files = [
    ...Array.from({ length: sceneViews }, (_, index) => ({ label: `Scene render ${index + 1}`, tokens: PICTURE + 15 })),
    ...attachments.map((file) => ({
      label: file.name,
      tokens: file.kind === "image" || file.kind === "video" ? PICTURE + 20 : 200,
    })),
  ];
  const categories: ContextCategoryView[] = [
    { part: "system", tokens: 1_830, items: [] },
    { part: "tools", tokens: sum(TOOLS), items: TOOLS },
    { part: "skills", tokens: sum(SKILLS), items: SKILLS },
    { part: "memory", tokens: 0, items: [] },
    { part: "project", tokens: sum(PROJECT), items: PROJECT },
    { part: "summary", tokens: 0, items: [] },
    { part: "history", tokens: spoken.reduce((total, text) => total + textTokens(text) + 4, 0), items: [] },
    { part: "message", tokens: 5, items: [] },
    { part: "attachments", tokens: sum(files), items: files },
  ];
  const used = sum(categories);
  const historyTokens = spoken.reduce((total, text) => total + textTokens(text), 0);
  return {
    model: "sample",
    window: WINDOW,
    windowKnown: false,
    used,
    reserve: RESERVE,
    free: Math.max(0, WINDOW - RESERVE - used),
    categories,
    compaction: { historyTokens, foldAt: 19_040, folding: false, foldsNextTurn: false, pruneAt: 38_080 },
  };
}
