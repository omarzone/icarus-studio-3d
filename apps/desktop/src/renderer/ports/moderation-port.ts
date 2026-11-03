import { definePort } from "../app/runtime/port.tsx";
import type { CommunityApi } from "../community-client/community-api.ts";
import { communityApi } from "../community-client/community-api.ts";
import { createModerationFixture } from "./moderation.fixture.ts";

export type ModerationQueue = "reports" | "new" | "banned" | "appeals";

export type ModerationItem = {
  id: string;
  creation: string;
  author: string;
  reason: string;
  reports: number;
  // Result of the automatic check every new creation goes through.
  scan: string;
};

export type ModerationDecision = "keep" | "remove" | "ban";

export type ModerationPort = {
  queueCounts: () => Promise<Record<ModerationQueue, number>>;
  listQueue: (queue: ModerationQueue) => Promise<ModerationItem[]>;
  // `id` is the creation the decision is about.
  decide: (input: { id: string; decision: ModerationDecision }) => Promise<void>;
};

// The moderation queues on the community service; only accounts with the moderator role may read or decide.
export function createCommunityModeration(
  api: Pick<CommunityApi, "moderationCounts" | "moderationQueue" | "decide"> = communityApi,
): ModerationPort {
  return {
    queueCounts: () => api.moderationCounts(),
    listQueue: (queue) => api.moderationQueue(queue),
    decide: async ({ id, decision }) => {
      await api.decide({ creation_id: id, decision });
    },
  };
}

export const moderationPort = definePort<ModerationPort>({
  app: createCommunityModeration(),
  prototype: createModerationFixture,
});
