// HDR-LAUNCHER
import { tokens } from "@icarus/ui-tokens";
import { Bell, Search } from "lucide-react";
import { useTitleBarHeight, WindowControlsSpace } from "../window-frame.tsx";

const NAV = ["Home", "Projects", "Community"] as const;

export function LauncherHeader({ active }: { active: (typeof NAV)[number] }) {
  useTitleBarHeight(tokens.size.headerLauncher);
  return (
    <header
      data-ui-id="HDR-LAUNCHER"
      className="title-bar col-span-full flex h-14 items-center gap-4.5 border-b border-line-subtle px-4.5"
    >
      <WindowControlsSpace side="start" />
      <span className="text-headline font-semibold">Icarus</span>
      {NAV.map((item) => (
        <button
          key={item}
          type="button"
          data-cta={item.toLowerCase()}
          aria-current={item === active ? "page" : undefined}
          className={
            item === active
              ? "px-1 py-4 text-body font-semibold text-fg shadow-[inset_0_-2px_0_var(--ic-fg)]"
              : "px-1 py-4 text-body text-fg-tertiary hover:text-fg active:opacity-80"
          }
        >
          {item}
        </button>
      ))}
      <label
        data-cta="search-creations"
        className="ml-auto flex h-8 w-65 items-center gap-2 rounded-button bg-control px-3 text-fg-tertiary hover:bg-control-raised has-focus:bg-control-raised"
      >
        <Search size={14} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          placeholder="Search creations"
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-tertiary"
        />
      </label>
      <button
        type="button"
        data-cta="notifications"
        aria-label="Notifications"
        className="grid size-8 place-items-center rounded-button text-fg-tool hover:bg-fill-hover hover:text-fg active:opacity-80"
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden />
      </button>
      <WindowControlsSpace side="end" />
    </header>
  );
}
