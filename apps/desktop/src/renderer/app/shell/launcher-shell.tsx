import type { ReactNode } from "react";
import { LauncherHeader } from "./launcher-header/launcher-header.tsx";

export function LauncherShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full grid-rows-[56px_minmax(0,1fr)] bg-app text-fg">
      <LauncherHeader active="Home" />
      <main className="min-h-0 overflow-hidden px-10 py-4">{children}</main>
    </div>
  );
}
