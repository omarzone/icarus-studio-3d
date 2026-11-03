import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ContextUsageView } from "../../ports/copilot-port.ts";
import type { ContextState } from "./context-popover.tsx";

// Re-read after every answer (the chat refreshes every query but the conversation's own) and as files come and go.
export const contextKey = (conversation: string, attachments: readonly string[]) =>
  ["copilot-context", conversation, ...attachments] as const;

export type ContextLoader = {
  conversation: string;
  load: (attachments: readonly string[]) => Promise<ContextUsageView>;
};

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : "The engine did not answer");

export function useContextUsage(
  loader: ContextLoader | undefined,
  attachments: readonly string[],
): { state: ContextState; refresh: () => void } | null {
  const query = useQuery({
    queryKey: contextKey(loader?.conversation ?? "", attachments),
    queryFn: () => (loader ? loader.load(attachments) : Promise.reject(new Error("No conversation"))),
    enabled: loader !== undefined,
    placeholderData: keepPreviousData,
  });
  if (!loader) {
    return null;
  }
  const refresh = () => void query.refetch();
  if (query.data) {
    return { state: { status: "ready", usage: query.data }, refresh };
  }
  if (query.isError) {
    return { state: { status: "error", message: reasonOf(query.error), retry: refresh }, refresh };
  }
  return { state: { status: "loading" }, refresh };
}
