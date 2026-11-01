import type { ModerationItem, ModerationPort, ModerationQueue } from "./moderation-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
const SCAN = "automatic scan: no code, no personal data";

const REPORTS: readonly ModerationItem[] = [
  {
    id: "valet-bot",
    creation: "Valet Bot",
    author: "mara",
    reason: "Stolen work, not credited",
    reports: 2,
    scan: SCAN,
  },
  {
    id: "salsa-dancer",
    creation: "Salsa Dancer",
    author: "lu",
    reason: "Inappropriate content",
    reports: 1,
    scan: SCAN,
  },
  { id: "lot-swarm", creation: "Lot Swarm", author: "dev_ana", reason: "Spam", reports: 4, scan: SCAN },
];

export function createModerationFixture(): ModerationPort {
  let reports = [...REPORTS];
  const counts: Record<ModerationQueue, number> = { reports: 7, new: 23, banned: 4, appeals: 1 };
  return {
    queueCounts: async () => ({ ...counts, reports: counts.reports - (REPORTS.length - reports.length) }),
    listQueue: async (queue) => (queue === "reports" ? reports : []),
    decide: async ({ id }) => {
      reports = reports.filter((item) => item.id !== id);
    },
  };
}
