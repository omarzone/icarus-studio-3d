import type { ReactNode } from "react";
import { WorkspaceHeader } from "./workspace-header/workspace-header.tsx";

type Props = {
  project: string;
  left: ReactNode;
  center: ReactNode;
  chat: ReactNode;
};

export function WorkspaceShell({ project, left, center, chat }: Props) {
  return (
    <div className="grid h-full grid-cols-[270px_minmax(0,1fr)_380px] grid-rows-[52px_minmax(0,1fr)] bg-app text-fg">
      <WorkspaceHeader project={project} active="World" primary="Train" />
      <div className="flex min-h-0 flex-col gap-2.5 pr-1.5 pb-3 pl-3">{left}</div>
      <div className="flex min-h-0 flex-col gap-2.5 px-1.5 pb-3">{center}</div>
      <div className="flex min-h-0 flex-col pr-3 pb-3 pl-1.5">{chat}</div>
    </div>
  );
}
