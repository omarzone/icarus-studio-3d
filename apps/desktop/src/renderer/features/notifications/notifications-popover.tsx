// POP-NOTIFICATIONS
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowBigUp, Check, Copy, History, MessageCircle, UserPlus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type AppNotification, type NotificationKind, notificationsPort } from "../../ports/notifications-port.ts";
import { Popover } from "../../ui/popover.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";

const ICONS: Record<NotificationKind, { icon: ReactNode; className: string }> = {
  "run-failed": { icon: "!", className: "text-danger" },
  published: { icon: <Check size={14} strokeWidth={1.75} />, className: "text-ok" },
  "run-finished": { icon: <History size={14} strokeWidth={1.75} />, className: "text-fg" },
  remix: { icon: <Copy size={14} strokeWidth={1.75} />, className: "text-warn" },
  attention: { icon: "!", className: "text-warn" },
  vote: { icon: <ArrowBigUp size={14} strokeWidth={1.75} />, className: "text-ok" },
  follow: { icon: <UserPlus size={14} strokeWidth={1.75} />, className: "text-fg" },
  invite: { icon: <Users size={14} strokeWidth={1.75} />, className: "text-fg" },
  moderation: { icon: "!", className: "text-warn" },
  comment: { icon: <MessageCircle size={14} strokeWidth={1.75} />, className: "text-fg" },
};

export function NotificationsPopover() {
  const notifications = usePort(notificationsPort);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["notifications"], queryFn: notifications.listNotifications });
  const markAllRead = useEngineAction(notifications.markAllRead);
  return (
    <Popover anchor={{ top: 60, right: 18 }} width="w-95" scrim>
      <div className="-m-1.5 flex flex-col gap-1">
        <div className="flex items-center px-2 py-1.5">
          <span className="leading-tight font-semibold">Notifications</span>
          <Act
            cta="Mark all read"
            onClick={() =>
              markAllRead.mutate(undefined, {
                onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
              })
            }
            className="ml-auto text-ui leading-tight text-fg-tertiary hover:text-fg active:opacity-80"
          >
            Mark all read
          </Act>
        </div>
        <QueryView
          query={query}
          isEmpty={(list) => list.length === 0}
          empty={<EmptyState title="Nothing new" body="Finished runs, reviews and remixes show up here." />}
        >
          {(list) => list.map((item) => <NotificationRow key={item.id} notification={item} />)}
        </QueryView>
      </div>
    </Popover>
  );
}

function NotificationRow({ notification }: { notification: AppNotification }) {
  const { icon, className } = ICONS[notification.kind];
  const warning = typeof icon === "string" ? `${icon}\n` : "";
  return (
    <GoTo
      to={notification.opens}
      params={notification.params}
      cta={`${warning}${notification.title}\n${notification.body}\n${notification.time}`}
      className={`grid grid-cols-[30px_minmax(0,1fr)] gap-2.5 rounded-card-sm p-2.5 text-left active:opacity-80 ${notification.unread ? "bg-control hover:bg-control-raised" : "hover:bg-control"}`}
    >
      <span
        aria-hidden
        className={`grid size-7.5 place-items-center rounded-full bg-control-raised font-bold ${className}`}
      >
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="flex items-start gap-2.5">
          <span className="leading-tight font-semibold">{notification.title}</span>
          <span className="ml-auto shrink-0 text-meta leading-tight text-fg-tertiary">{notification.time}</span>
        </span>
        <span className="text-ui leading-tight text-fg-secondary">{notification.body}</span>
      </span>
    </GoTo>
  );
}
