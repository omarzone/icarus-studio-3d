import type { RouteId } from "../navigation/catalog-id.ts";

// An action the interface offers whose logic is not built yet. `sprint` is its sprint in docs/plans/roadmap.md.
export type PendingAction = {
  key: string;
  summary: string;
  sprint: number;
  ids: readonly RouteId[];
};

export class NotAvailableYet extends Error {
  constructor(readonly action: PendingAction) {
    super(`${action.summary} is not available yet`);
    this.name = "NotAvailableYet";
  }
}

const registry = new Map<string, PendingAction>();

export function pending<Args extends unknown[], Result>(action: PendingAction): (...args: Args) => Promise<Result> {
  if (registry.has(action.key)) {
    throw new Error(`Pending action "${action.key}" is declared twice`);
  }
  registry.set(action.key, action);
  return () => Promise.reject(new NotAvailableYet(action));
}

export function pendingActions(): PendingAction[] {
  return [...registry.values()].sort((a, b) => a.sprint - b.sprint || a.key.localeCompare(b.key));
}
