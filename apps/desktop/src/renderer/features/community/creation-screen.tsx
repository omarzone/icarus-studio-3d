// SCR-CREATION
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Play } from "lucide-react";
import { useState } from "react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { accountPort } from "../../ports/account-port.ts";
import { type CreationComment, type CreationDetail, communityPort } from "../../ports/community-port.ts";
import { Avatar } from "../../ui/avatar.tsx";
import { LauncherPage } from "../../ui/launcher-page.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { Segmented } from "../../ui/segmented.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { CreationAside } from "./creation-aside.tsx";

type Tab = "overview" | "brain" | "versions" | "comments";

export function useCreation() {
  const id = useNavigation((state) => state.params.creation);
  const community = usePort(communityPort);
  return useQuery({ queryKey: ["community", "creation", id ?? null], queryFn: () => community.getCreation(id) });
}

export function CreationScreen() {
  const query = useCreation();
  return (
    <LauncherPage active="Community" activeGoesTo="SCR-COMMUNITY">
      <QueryView query={query}>{(creation) => <CreationPage creation={creation} />}</QueryView>
    </LauncherPage>
  );
}

function CreationPage({ creation }: { creation: CreationDetail }) {
  const community = usePort(communityPort);
  const account = usePort(accountPort);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const vote = useEngineAction(community.vote);
  const remix = useEngineAction(community.remix);
  const follow = useEngineAction(account.follow);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6 pt-1">
      <div className="flex min-h-0 flex-col gap-3.5">
        <div className="relative h-100 rounded-bubble bg-control">
          <GoTo
            to="SCR-TIMELAPSE"
            params={{ creation: creation.id }}
            cta={`Watch how it learned · ${creation.timelapseLength}`}
            className="absolute bottom-3.5 left-3.5 flex items-center gap-1 rounded-full bg-overlay px-3 py-1.5 text-ui leading-tight hover:bg-control-raised active:opacity-80"
          >
            <Play size={12} strokeWidth={1.75} aria-hidden />
            Watch how it learned · {creation.timelapseLength}
          </GoTo>
        </div>
        <Segmented
          items={[
            { label: "Overview", active: tab === "overview", onSelect: () => setTab("overview") },
            { label: "How it learned", active: false, to: "SCR-TIMELAPSE", params: { creation: creation.id } },
            { label: "Brain", active: tab === "brain", onSelect: () => setTab("brain") },
            { label: "Versions", active: tab === "versions", onSelect: () => setTab("versions") },
            {
              label: `Comments · ${creation.commentCount}`,
              active: tab === "comments",
              onSelect: () => setTab("comments"),
            },
          ]}
        />
        <CreationTab tab={tab} creation={creation} />
      </div>
      <CreationAside
        creation={creation}
        onVote={() =>
          vote.mutate(creation.id, {
            onSuccess: () => client.invalidateQueries({ queryKey: ["community", "creation"] }),
          })
        }
        onFollow={() => follow.mutate(creation.author.handle)}
        onRemix={() => remix.mutate(creation.id)}
      />
    </div>
  );
}

function CreationTab({ tab, creation }: { tab: Tab; creation: CreationDetail }) {
  switch (tab) {
    case "overview":
      return (
        <>
          <p className="m-0 leading-[1.55] text-fg-secondary">{creation.description}</p>
          <div className="grid grid-cols-5 gap-2">
            {creation.checkpoints.map((checkpoint) => (
              <GoTo
                key={checkpoint}
                to="SCR-TIMELAPSE"
                params={{ creation: creation.id }}
                cta={checkpoint}
                className="flex flex-col overflow-hidden rounded-card-sm bg-control text-left hover:bg-control-raised active:opacity-80"
              >
                <span aria-hidden className="h-19 w-full bg-control-raised" />
                <span className="px-2 py-1.5 text-meta leading-tight">{checkpoint}</span>
              </GoTo>
            ))}
          </div>
          <Comments comments={creation.comments} />
        </>
      );
    case "brain":
      return <FactList lines={creation.brain} empty="No brain details shared" />;
    case "versions":
      return <FactList lines={creation.versions.map((v) => `${v.label} · ${v.note}`)} empty="No earlier versions" />;
    case "comments":
      return <Comments comments={creation.comments} />;
  }
}

function Comments({ comments }: { comments: readonly CreationComment[] }) {
  if (comments.length === 0) {
    return <EmptyState title="No comments yet" />;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {comments.map((comment) => (
        <div key={comment.id} className="flex gap-2.5">
          <Avatar initials={comment.author.initials} tone={comment.author.tone} className="size-7 text-micro" />
          <span className="flex flex-col gap-0.5 text-ui leading-tight">
            <span className="font-semibold">@{comment.author.handle}</span>
            <span className="text-fg-secondary">{comment.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function FactList({ lines, empty }: { lines: readonly string[]; empty: string }) {
  if (lines.length === 0) {
    return <EmptyState title={empty} />;
  }
  return (
    <div className="flex flex-col gap-2 rounded-card bg-control p-3 text-ui">
      {lines.map((line) => (
        <span key={line} className="flex items-center gap-2.25 leading-tight">
          <Check size={13} strokeWidth={1.75} className="text-ok" aria-hidden />
          {line}
        </span>
      ))}
    </div>
  );
}
