// SCR-MODERATION
import { tokens } from "@icarus/ui-tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useCommunityPicture } from "../../app/runtime/community-picture.ts";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { useTitleBarHeight, WindowControlsSpace } from "../../app/shell/window-frame.tsx";
import {
  type ModerationDecision,
  type ModerationItem,
  type ModerationQueue,
  moderationPort,
} from "../../ports/moderation-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { StatusPill } from "../../ui/status-pill.tsx";

const QUEUES: readonly { queue: ModerationQueue; label: string; title: string }[] = [
  { queue: "reports", label: "Reports", title: "Reports" },
  { queue: "new", label: "New creations", title: "New creations" },
  { queue: "banned", label: "Banned people", title: "Banned people" },
  { queue: "appeals", label: "Appeals", title: "Appeals" },
];

// A team tool with its own title bar instead of the launcher header.
export function ModerationScreen() {
  useTitleBarHeight(tokens.size.headerWorkspace);
  const moderation = usePort(moderationPort);
  const [queue, setQueue] = useState<ModerationQueue>("reports");
  const counts = useQuery({ queryKey: ["moderation", "counts"], queryFn: moderation.queueCounts });
  const items = useQuery({ queryKey: ["moderation", queue], queryFn: () => moderation.listQueue(queue) });
  const title = QUEUES.find((item) => item.queue === queue)?.title ?? "";
  return (
    <div className="grid h-full grid-cols-[240px_minmax(0,1fr)] grid-rows-[52px_minmax(0,1fr)] bg-app text-fg">
      <header className="title-bar col-span-full flex h-13 items-center gap-3.5 border-b border-line-subtle px-4.5">
        <WindowControlsSpace side="start" />
        <span className="font-semibold">Icarus · Moderation</span>
        <StatusPill tone="warn">Team only</StatusPill>
        <span className="ml-auto text-fg-tertiary">Signed in as moderator</span>
        <WindowControlsSpace side="end" />
      </header>
      <nav aria-label="Queues" className="flex flex-col gap-0.5 px-3 py-4">
        {QUEUES.map((item) => {
          const current = item.queue === queue;
          return (
            <Act
              key={item.queue}
              cta={item.label}
              aria-current={current ? "page" : undefined}
              onClick={() => setQueue(item.queue)}
              className={`flex rounded-button px-3 py-2.25 text-left leading-tight ${current ? "bg-control text-fg" : "text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80"}`}
            >
              {item.label}
              <span className="ml-auto text-fg-tertiary">{counts.data?.[item.queue] ?? ""}</span>
            </Act>
          );
        })}
      </nav>
      <main className="flex min-h-0 flex-col gap-3 overflow-auto px-7.5 py-5.5">
        <h1 className="m-0 text-title-2 leading-tight font-semibold">{title}</h1>
        <p className="m-0 leading-tight text-fg-secondary">
          Every new creation is scanned automatically. People review anything reported.
        </p>
        <QueryView
          query={items}
          isEmpty={(list) => list.length === 0}
          empty={<EmptyState title="Nothing to review" body="This queue is empty." />}
        >
          {(list) => <ReviewList items={list} queue={queue} />}
        </QueryView>
      </main>
    </div>
  );
}

function ReportPicture({ picture }: { picture: string | null }) {
  const source = useCommunityPicture(picture);
  return (
    <span aria-hidden className="h-21.5 w-35 overflow-hidden rounded-button bg-control-raised">
      {source ? <img src={source} alt="" draggable={false} className="size-full object-cover" /> : null}
    </span>
  );
}

function ReviewList({ items, queue }: { items: readonly ModerationItem[]; queue: ModerationQueue }) {
  const moderation = usePort(moderationPort);
  const client = useQueryClient();
  const decide = useEngineAction(moderation.decide);
  const [selected, setSelected] = useState(items[0]?.id ?? null);
  const act = (id: string, decision: ModerationDecision) =>
    decide.mutate({ id, decision }, { onSuccess: () => client.invalidateQueries({ queryKey: ["moderation"] }) });
  return items.map((item) => (
    <section
      key={item.id}
      aria-label={`${item.creation} by @${item.author}`}
      onFocusCapture={() => setSelected(item.id)}
      className={`grid grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-4 rounded-card p-3 ${item.id === selected ? "bg-control" : "border border-line"}`}
    >
      <ReportPicture picture={item.picture} />
      <span className="flex flex-col gap-1 leading-tight">
        <span className="font-semibold">
          {item.creation} <span className="font-normal text-fg-tertiary">by @{item.author}</span>
        </span>
        <span className="text-ui">{item.reason}</span>
        <span className="text-meta text-fg-tertiary">
          {item.reports} {item.reports === 1 ? "report" : "reports"} · {item.scan}
        </span>
      </span>
      <span className="flex gap-1.5">
        <Act
          cta="Keep"
          onClick={() => act(item.id, "keep")}
          className={buttonClass("secondary", "h-8.5 px-4 text-body")}
        >
          Keep
        </Act>
        <Act
          cta="Remove"
          onClick={() => act(item.id, "remove")}
          className={buttonClass("secondary", "h-8.5 px-4 text-body")}
        >
          Remove
        </Act>
        <Act
          cta="Ban user"
          disabled={queue === "banned"}
          title={queue === "banned" ? "Already banned" : undefined}
          onClick={() => act(item.id, "ban")}
          className={buttonClass("primary", "h-8.5 text-body")}
        >
          Ban user
        </Act>
      </span>
    </section>
  ));
}
