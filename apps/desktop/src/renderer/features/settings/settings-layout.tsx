import type { ReactNode } from "react";
import type { ScreenId } from "../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { LauncherPage } from "../../ui/launcher-page.tsx";

export type SettingsSection = "profile" | "models" | "privacy" | "training" | "notifications";

const NAV: readonly { label: string; section: SettingsSection; to: ScreenId; params?: Record<string, string> }[] = [
  { label: "Profile", section: "profile", to: "SCR-SETTINGS-PROFILE" },
  { label: "AI models", section: "models", to: "SCR-SETTINGS-MODELS" },
  { label: "Privacy and safety", section: "privacy", to: "SCR-SETTINGS-PRIVACY" },
  { label: "Blocked people", section: "privacy", to: "SCR-SETTINGS-PRIVACY", params: { focus: "blocked" } },
  { label: "Training and hardware", section: "training", to: "SCR-SETTINGS-TRAINING" },
  { label: "Storage", section: "training", to: "SCR-SETTINGS-TRAINING", params: { focus: "storage" } },
  { label: "Notifications", section: "notifications", to: "SCR-SETTINGS-NOTIFICATIONS" },
];

const itemClass = "rounded-button px-3 py-2.25 text-left leading-tight";

type Props = {
  section: SettingsSection;
  title: string;
  description: string;
  // Uses the full page width instead of the 820 px column.
  wide?: boolean;
  // Runs for side navigation items that stay on this page (Blocked people on the privacy page).
  onLocalItem?: (label: string) => void;
  children: ReactNode;
};

// Shared frame of the settings pages: a 260 px side navigation and a page of at most 820 px.
export function SettingsLayout({ section, title, description, wide = false, onLocalItem, children }: Props) {
  return (
    <LauncherPage active="Home" activeGoesTo="SCR-HOME">
      <div className="-mx-10 -my-4 grid min-h-[calc(100%+32px)] grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Settings" className="flex flex-col gap-0.5 px-3.5 py-5">
          {NAV.map((item, index) => {
            const current = item.section === section;
            if (!current) {
              return (
                <GoTo
                  key={item.label}
                  to={item.to}
                  params={item.params}
                  cta={item.label}
                  className={`${itemClass} text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80`}
                >
                  {item.label}
                </GoTo>
              );
            }
            const first = NAV.findIndex((entry) => entry.section === section) === index;
            return (
              <Act
                key={item.label}
                cta={item.label}
                aria-current={first ? "page" : undefined}
                onClick={() => onLocalItem?.(item.label)}
                className={
                  first
                    ? `${itemClass} bg-control text-fg`
                    : `${itemClass} text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80`
                }
              >
                {item.label}
              </Act>
            );
          })}
        </nav>
        <div className={`flex flex-col gap-4 px-7.5 py-5.5 ${wide ? "" : "max-w-205"}`}>
          <h1 className="m-0 text-title-2 leading-tight font-semibold">{title}</h1>
          <p className={`m-0 text-fg-secondary ${wide ? "leading-tight" : "leading-normal"}`}>{description}</p>
          {children}
        </div>
      </div>
    </LauncherPage>
  );
}
