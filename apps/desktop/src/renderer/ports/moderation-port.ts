import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createModerationFixture } from "./moderation.fixture.ts";

export type ModerationQueue = "reports" | "new" | "banned" | "appeals";

export type ModerationItem = {
  id: string;
  creation: string;
  author: string;
  reason: string;
  reports: number;
  // Result of the automatic scan every new creation goes through.
  scan: string;
};

export type ModerationDecision = "keep" | "remove" | "ban";

export type ModerationPort = {
  queueCounts: () => Promise<Record<ModerationQueue, number>>;
  listQueue: (queue: ModerationQueue) => Promise<ModerationItem[]>;
  decide: (input: { id: string; decision: ModerationDecision }) => Promise<void>;
};

export const moderationPort = definePort<ModerationPort>({
  app: {
    queueCounts: pending({
      key: "moderation.counts",
      summary: "Moderation queues",
      sprint: 13,
      ids: ["SCR-MODERATION"],
    }),
    listQueue: pending({
      key: "moderation.list",
      summary: "Reported creations",
      sprint: 13,
      ids: ["SCR-MODERATION"],
    }),
    decide: pending({
      key: "moderation.decide",
      summary: "Keeping, removing or banning",
      sprint: 13,
      ids: ["SCR-MODERATION"],
    }),
  },
  prototype: createModerationFixture,
});
