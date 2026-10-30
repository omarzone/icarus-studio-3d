// HDR-LAUNCHER
import { Bell, Search } from "lucide-react";
import { WindowDots } from "../window-dots.tsx";

const NAV = ["Home", "Projects", "Community"] as const;

export function LauncherHeader({ active }: { active: (typeof NAV)[number] }) {
  return (
    <header
      data-ui-id="HDR-LAUNCHER"
      className="col-span-full flex h-14 items-center gap-4.5 border-b border-line-subtle px-4.5"
    >
      <WindowDots />
      <span className="ml-2.5 text-headline font-semibold">Icarus</span>
      {NAV.map((item) => (
        <span
          key={item}
          data-cta={item.toLowerCase()}
          className={
            item === active
              ? "px-1 py-4 text-body font-semibold text-fg shadow-[inset_0_-2px_0_var(--ic-fg)]"
              : "px-1 py-4 text-body text-fg-tertiary"
          }
        >
          {item}
        </span>
      ))}
      <span className="ml-auto flex h-8 w-65 items-center gap-2 rounded-button bg-control px-3 text-fg-tertiary">
        <Search size={14} strokeWidth={1.75} aria-hidden />
        Search creations
      </span>
      <Bell size={18} strokeWidth={1.75} aria-label="Notifications" className="text-fg-tool" />
    </header>
  );
}
