// HDR-LAUNCHER
import { tokens } from "@icarus/ui-tokens";
import { ArrowLeft, Bell, Search } from "lucide-react";
import { buttonClass } from "../../../ui/button-styles.ts";
import { ctaSlug, type ScreenId } from "../../navigation/catalog-id.ts";
import { Act, GoTo } from "../../navigation/go-to.tsx";
import { useNavigation, useNavigationStore } from "../../navigation/navigation-store.tsx";
import { takeWayBack, wayBack } from "../../navigation/way-back.ts";
import { useTitleBarHeight, WindowControlsSpace } from "../window-frame.tsx";

const PAGES = ["Home", "Projects", "Community"] as const;
export type LauncherPage = (typeof PAGES)[number];
const NAV: Record<LauncherPage, ScreenId> = { Home: "SCR-HOME", Projects: "SCR-PROJECTS", Community: "SCR-COMMUNITY" };

export type Account = { initial: string; signedIn: boolean };

export type LauncherHeaderProps = {
  active: LauncherPage | null;
  // Where the active link leads on pages below it (Creation, Profile, Settings); omitted when it acts in place.
  activeGoesTo?: ScreenId;
  account: Account;
  unread?: boolean;
};

export function LauncherHeader({ active, activeGoesTo, account, unread = false }: LauncherHeaderProps) {
  useTitleBarHeight(tokens.size.headerLauncher);
  const go = useNavigation((state) => state.go);
  return (
    <header
      data-ui-id="HDR-LAUNCHER"
      className="title-bar col-span-full flex h-14 items-center gap-4.5 border-b border-line-subtle px-4.5"
    >
      <WindowControlsSpace side="start" />
      <WayBackButton />
      <span className="text-headline font-semibold">Icarus Studio 3D</span>
      {PAGES.map((item) =>
        item === active && activeGoesTo ? (
          <GoTo
            key={item}
            to={activeGoesTo}
            cta={item}
            aria-current="page"
            className="px-1 py-4 text-body font-semibold text-fg shadow-[inset_0_-2px_0_var(--ic-fg)]"
          >
            {item}
          </GoTo>
        ) : item === active ? (
          <Act
            key={item}
            cta={item}
            aria-current="page"
            className="px-1 py-4 text-body font-semibold text-fg shadow-[inset_0_-2px_0_var(--ic-fg)]"
          >
            {item}
          </Act>
        ) : (
          <GoTo
            key={item}
            to={NAV[item]}
            cta={item}
            className="px-1 py-4 text-body text-fg-tertiary hover:text-fg active:opacity-80"
          >
            {item}
          </GoTo>
        ),
      )}
      <label
        data-cta="search-creations"
        data-goes-to="SCR-COMMUNITY"
        className="ml-auto flex h-8 w-65 items-center gap-2 rounded-button bg-control px-3 text-fg-tertiary hover:bg-control-raised has-focus:bg-control-raised"
      >
        <Search size={14} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          placeholder="Search creations"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              go("SCR-COMMUNITY", { search: event.currentTarget.value });
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-tertiary"
        />
      </label>
      <GoTo
        to="POP-NOTIFICATIONS"
        cta="Notifications"
        aria-label="Notifications"
        className={buttonClass("icon", "relative")}
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden />
        {unread ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger" /> : null}
      </GoTo>
      <GoTo
        to={account.signedIn ? "SCR-PROFILE" : "MOD-SIGN-IN"}
        cta={account.initial}
        aria-label={account.signedIn ? "Profile" : "Sign in"}
        className="grid size-8 place-items-center rounded-full bg-control-raised text-ui font-semibold hover:bg-fill-hover active:opacity-80"
      >
        {account.initial}
      </GoTo>
      <WindowControlsSpace side="end" />
    </header>
  );
}

// Leaves settings and the launcher pages for the project they were opened from (or Home); Escape does the same.
function WayBackButton() {
  const screen = useNavigation((state) => state.screen);
  const history = useNavigation((state) => state.history);
  const store = useNavigationStore();
  const way = wayBack({ screen, history });
  if (!way) {
    return null;
  }
  return (
    <button
      type="button"
      data-cta={ctaSlug(way.label)}
      data-goes-to={way.to}
      title={`${way.label} (Esc)`}
      onClick={() => takeWayBack(store.getState(), way)}
      className={buttonClass("ghost", "-ml-1.5 gap-1.5 px-2")}
    >
      <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
      {way.label}
    </button>
  );
}
