import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createRevisionsFixture } from "./revisions.fixture.ts";

export type RevisionAuthor = "you" | "copilot";

export type RevisionSummary = {
  id: string;
  // What changed, in one line ("Randomized parked cars, 16 copies").
  change: string;
  author: RevisionAuthor;
  // Relative time as the engine reports it ("2 min ago", "yesterday").
  when: string;
  current: boolean;
};

export type RevisionsPort = {
  // Newest first.
  listRevisions: (projectId: string) => Promise<RevisionSummary[]>;
  // Restoring never rewrites history: it appends a new revision equal to the restored one.
  restoreRevision: (input: { projectId: string; revisionId: string }) => Promise<RevisionSummary>;
};

export const revisionsPort = definePort<RevisionsPort>({
  app: {
    listRevisions: pending({
      key: "revisions.list",
      summary: "The history of a project",
      sprint: 2,
      ids: ["MOD-HISTORY", "POP-PROJECT-MENU"],
    }),
    restoreRevision: pending({
      key: "revisions.restore",
      summary: "Restoring a revision",
      sprint: 2,
      ids: ["MOD-HISTORY"],
    }),
  },
  prototype: createRevisionsFixture,
});
