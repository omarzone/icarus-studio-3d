import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { CommunityNotConnected, CommunitySignedOut } from "../../community-client/community-request.ts";
import { CopilotNotConnected } from "../../ports/copilot-connection.ts";
import { useNotices } from "./notices.ts";
import { NotAvailableYet } from "./pending.ts";

export function EngineQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Asking again cannot help a pending action or a copilot without a model.
            retry: (count, error) =>
              !(
                error instanceof NotAvailableYet ||
                error instanceof CopilotNotConnected ||
                error instanceof CommunityNotConnected ||
                error instanceof CommunitySignedOut
              ) && count < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// Runs a port action; a pending action tells the user it is not available yet instead of failing silently.
export function useEngineAction<Args, Result>(action: (args: Args) => Promise<Result>) {
  const notify = useNotices((state) => state.notify);
  return useMutation({
    mutationFn: action,
    onError: (error) =>
      notify(
        error instanceof NotAvailableYet
          ? { title: "Not available yet", detail: error.action.summary }
          : { title: "That did not work", detail: error.message },
      ),
  });
}
