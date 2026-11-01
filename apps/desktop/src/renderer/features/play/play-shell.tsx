import type { ReactNode } from "react";

type Props = { header: ReactNode; left: ReactNode; center: ReactNode; chat: ReactNode };

// The workspace grid with the Play header: 270 px left column, flexible center, 380 px chat column.
export function PlayShell({ header, left, center, chat }: Props) {
  return (
    <div className="grid h-full grid-cols-[270px_minmax(0,1fr)_380px] grid-rows-[52px_minmax(0,1fr)] border border-line-strong bg-app text-fg">
      {header}
      <div className="flex min-h-0 flex-col gap-2.5 pr-1.5 pb-3 pl-3">{left}</div>
      <div className="flex min-h-0 flex-col gap-2.5 px-1.5 pb-3">{center}</div>
      <div className="flex min-h-0 flex-col pr-3 pb-3 pl-1.5">{chat}</div>
    </div>
  );
}
