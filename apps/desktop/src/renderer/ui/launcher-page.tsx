import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ScreenId } from "../app/navigation/catalog-id.ts";
import { usePort } from "../app/runtime/port.tsx";
import type { LauncherPage as Page } from "../app/shell/launcher-header/launcher-header.tsx";
import { LauncherShell } from "../app/shell/launcher-shell.tsx";
import { accountPort } from "../ports/account-port.ts";
import { notificationsPort } from "../ports/notifications-port.ts";

type Props = {
  active: Page | null;
  activeGoesTo?: ScreenId;
  // Draws the header for a signed-out visitor even when an account exists.
  signedOut?: boolean;
  children: ReactNode;
};

// A launcher page with the header filled from the account and notifications; signed out until an account is known.
export function LauncherPage({ active, activeGoesTo, signedOut = false, children }: Props) {
  const account = usePort(accountPort);
  const notifications = usePort(notificationsPort);
  const accountQuery = useQuery({ queryKey: ["account"], queryFn: account.getAccount });
  const notificationsQuery = useQuery({ queryKey: ["notifications"], queryFn: notifications.listNotifications });
  const known = accountQuery.data;
  const unread = notificationsQuery.data?.some((item) => item.unread) ?? false;
  return (
    <LauncherShell
      active={active}
      activeGoesTo={activeGoesTo}
      account={{ initial: known?.initials ?? "?", signedIn: !signedOut && (known?.signedIn ?? false) }}
      unread={unread}
    >
      {children}
    </LauncherShell>
  );
}
