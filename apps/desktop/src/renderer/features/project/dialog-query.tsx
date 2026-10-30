import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Dialog } from "../../ui/dialog.tsx";
import { QueryView } from "../../ui/query-view.tsx";

type Props<T> = {
  query: UseQueryResult<T>;
  // Title and width shown while the data is loading, missing or failed, so the dialog can still be closed.
  title: string;
  width: string;
  children: (data: T) => ReactNode;
};

export function DialogQuery<T>({ query, title, width, children }: Props<T>) {
  if (query.isSuccess) {
    return children(query.data);
  }
  return (
    <Dialog title={title} width={width}>
      <div className="h-40">
        <QueryView query={query}>{() => null}</QueryView>
      </div>
    </Dialog>
  );
}
