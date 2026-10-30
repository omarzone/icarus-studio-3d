import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useNotices } from "./notices.ts";
import { NotAvailableYet } from "./pending.ts";

export function EngineQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) => !(error instanceof NotAvailableYet) && count < 2,
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
