import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { revisionViews } from "./project-views.ts";
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
  undo: (projectId: string) => Promise<void>;
  redo: (projectId: string) => Promise<void>;
};

export const revisionsPort = definePort<RevisionsPort>({
  app: {
    listRevisions: async (projectId) => {
      const [revisions, state] = await Promise.all([engineApi.revisions(projectId), engineApi.project(projectId)]);
      return revisionViews(revisions, state.revision.number, new Date());
    },
    restoreRevision: async ({ projectId, revisionId }) => {
      const state = await engineApi.restoreRevision(projectId, Number(revisionId));
      const [view] = revisionViews([state.revision], state.revision.number, new Date());
      if (!view) {
        throw new Error("The engine did not return the restored revision");
      }
      return view;
    },
    undo: async (projectId) => {
      await engineApi.undo(projectId);
    },
    redo: async (projectId) => {
      await engineApi.redo(projectId);
    },
  },
  prototype: createRevisionsFixture,
});
