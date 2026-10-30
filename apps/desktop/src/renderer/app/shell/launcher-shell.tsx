import type { ReactNode } from "react";
import { type Account, LauncherHeader, type LauncherPage } from "./launcher-header/launcher-header.tsx";

type Props = { active: LauncherPage | null; account: Account; unread?: boolean; children: ReactNode };

export function LauncherShell({ active, account, unread, children }: Props) {
  return (
    <div className="grid h-full grid-rows-[56px_minmax(0,1fr)] bg-app text-fg">
      <LauncherHeader active={active} account={account} unread={unread} />
      <main className="min-h-0 overflow-auto px-10 py-4">{children}</main>
    </div>
  );
}
