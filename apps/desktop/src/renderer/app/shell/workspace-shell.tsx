import type { ReactNode } from "react";
import { WorkspaceHeader, type WorkspaceHeaderProps } from "./workspace-header/workspace-header.tsx";

type Props = {
  header: WorkspaceHeaderProps;
  left?: ReactNode;
  center?: ReactNode;
  // Replaces the left and center columns with one page panel (Ideas).
  page?: ReactNode;
  chat: ReactNode;
};

// Workspace shell from the style guide: 270 px left column, flexible center, 380 px chat column.
export function WorkspaceShell({ header, left, center, page, chat }: Props) {
  return (
    <div className="grid h-full grid-cols-[270px_minmax(0,1fr)_380px] grid-rows-[52px_minmax(0,1fr)] border border-line-strong bg-app text-fg">
      <WorkspaceHeader {...header} />
      {page ? (
        <div className="col-span-2 flex min-h-0 flex-col gap-2.5 pr-1.5 pb-3 pl-3">{page}</div>
      ) : (
        <>
          <div className="flex min-h-0 flex-col gap-2.5 pr-1.5 pb-3 pl-3">{left}</div>
          <div className="flex min-h-0 flex-col gap-2.5 px-1.5 pb-3">{center}</div>
        </>
      )}
      <div className="flex min-h-0 flex-col pr-3 pb-3 pl-1.5">{chat}</div>
    </div>
  );
}
