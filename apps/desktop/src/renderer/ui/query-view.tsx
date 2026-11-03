import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NotAvailableYet } from "../app/runtime/pending.ts";
import { CommunityNotConnected, CommunitySignedOut } from "../community-client/community-request.ts";
import { CopilotNotConnected } from "../ports/copilot-connection.ts";
import { CommunityNotConnectedState, CommunitySignedOutState } from "./community-states.tsx";
import { CopilotNotConnectedState } from "./copilot-not-connected.tsx";
import { ErrorState, LoadingState, NotAvailableYetState } from "./states.tsx";

type Props<T> = {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loading?: ReactNode;
  errorTitle?: string;
};

// Renders loading, not-available, not-connected, signed-out, error and empty states for an engine query, then the data.
export function QueryView<T>({ query, children, isEmpty, empty, loading, errorTitle }: Props<T>) {
  if (query.isPending) {
    return loading ?? <LoadingState />;
  }
  if (query.isError) {
    if (query.error instanceof NotAvailableYet) {
      return <NotAvailableYetState action={query.error.action} />;
    }
    if (query.error instanceof CopilotNotConnected) {
      return <CopilotNotConnectedState detail={query.error.message} />;
    }
    if (query.error instanceof CommunityNotConnected) {
      return <CommunityNotConnectedState detail={query.error.message} />;
    }
    if (query.error instanceof CommunitySignedOut) {
      return <CommunitySignedOutState />;
    }
    return <ErrorState title={errorTitle ?? "This could not be loaded"} detail={query.error.message} />;
  }
  if (isEmpty?.(query.data) && empty) {
    return empty;
  }
  return children(query.data);
}
