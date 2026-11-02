import type { ReactNode } from "react";
import { LauncherHeader, type LauncherHeaderProps } from "./launcher-header/launcher-header.tsx";

type Props = LauncherHeaderProps & { children: ReactNode };

export function LauncherShell({ children, ...header }: Props) {
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-app text-fg">
      <LauncherHeader {...header} />
      <main className="min-h-0 overflow-auto px-10 py-4">{children}</main>
    </div>
  );
}
