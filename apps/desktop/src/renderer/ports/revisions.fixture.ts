import type { RevisionSummary, RevisionsPort } from "./revisions-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
export const REVISIONS_FIXTURE: readonly RevisionSummary[] = [
  {
    id: "r14",
    change: "Added 2 side sensors, collision penalty 0.2 → 1.0",
    author: "copilot",
    when: "2 min ago",
    current: true,
  },
  { id: "r13", change: "Randomized parked cars, 16 copies", author: "you", when: "1 h ago", current: false },
  { id: "r12", change: "Built Park Pilot from your idea", author: "copilot", when: "today 10:02", current: false },
  { id: "r11", change: "Tighter parking spots", author: "you", when: "yesterday", current: false },
];

export function createRevisionsFixture(): RevisionsPort {
  const byProject = new Map<string, RevisionSummary[]>();
  const revisionsOf = (projectId: string) => byProject.get(projectId) ?? [...REVISIONS_FIXTURE];
  return {
    listRevisions: async (projectId) => revisionsOf(projectId),
    restoreRevision: async ({ projectId, revisionId }) => {
      const revisions = revisionsOf(projectId);
      const source = revisions.find((item) => item.id === revisionId);
      if (!source) {
        throw new Error(`No revision ${revisionId}`);
      }
      const restored: RevisionSummary = {
        id: `r${Math.max(0, ...revisions.map((item) => Number(item.id.slice(1)) || 0)) + 1}`,
        change: `Restored ${source.id}: ${source.change}`,
        author: "you",
        when: "now",
        current: true,
      };
      byProject.set(projectId, [restored, ...revisions.map((item) => ({ ...item, current: false }))]);
      return restored;
    },
    // The sample history is fixed; undo and redo have nothing to walk in the prototype.
    undo: async () => undefined,
    redo: async () => undefined,
  };
}
