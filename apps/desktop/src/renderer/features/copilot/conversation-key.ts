import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { copilotPort } from "../../ports/copilot-port.ts";

export const copilotKey = (conversation: string) => ["copilot", conversation] as const;
export const previewKey = (conversation: string) => ["copilot-preview", conversation] as const;

// The conversation a workspace shows: the open project's in the app, the workspace's sample in the prototype.
// Null in the app while no project is open.
export function useConversationKey(sample: string): string | null {
  const mode = useRuntimeMode();
  const project = useNavigation((state) => state.params.project);
  if (mode === "prototype") {
    return sample;
  }
  return project ?? null;
}

// The proposal waiting for an answer, drawn over the viewport before it is applied.
export function useProposalPreview(conversation: string | null) {
  const port = usePort(copilotPort);
  return useQuery({
    queryKey: previewKey(conversation ?? ""),
    queryFn: () => port.getPreview(conversation ?? ""),
    enabled: conversation !== null,
  });
}
