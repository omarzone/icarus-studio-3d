import { ArrowBigUp, Check, Flag } from "lucide-react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import type { CreationDetail } from "../../ports/community-port.ts";
import { Avatar } from "../../ui/avatar.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { compactNumber } from "../../ui/compact-number.ts";

type Props = {
  creation: CreationDetail;
  onVote: () => void;
  onFollow: () => void;
};

export function CreationAside({ creation, onVote, onFollow }: Props) {
  const { author } = creation;
  return (
    <aside className="flex flex-col gap-3.5">
      <div>
        <h1 className="m-0 text-title-1 leading-tight font-bold tracking-[-0.02em]">{creation.name}</h1>
        <span className="leading-tight text-fg-tertiary">{creation.tagline}</span>
      </div>
      <div className="flex items-center gap-3 rounded-card bg-control p-3">
        <GoTo
          to="SCR-PROFILE"
          params={{ user: author.handle }}
          cta={`${author.initials}\n${author.name}\n@${author.handle} · ${author.creations} creations\nFollow`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-button text-left hover:opacity-90 active:opacity-80"
        >
          <Avatar initials={author.initials} tone={author.tone} className="size-11 text-headline" />
          <span className="flex flex-col">
            <span className="leading-tight font-semibold">{author.name}</span>
            <span className="text-ui leading-tight text-fg-tertiary">
              @{author.handle} · {author.creations} creations
            </span>
          </span>
        </GoTo>
        <Act
          cta="Follow"
          onClick={onFollow}
          className="flex h-7.5 items-center rounded-full bg-selected px-3 text-ui font-semibold text-on-selected hover:opacity-90 active:opacity-80"
        >
          Follow
        </Act>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={compactNumber(creation.votes)} label="votes" />
        <Stat value={compactNumber(creation.remixes)} label="remixes" />
        <Stat value={compactNumber(creation.downloads)} label="downloads" />
      </div>
      <div className="flex gap-2">
        <GoTo
          to="STA-WORLD-EMPTY"
          params={{ remix: creation.id }}
          cta="Remix into my projects"
          className={buttonClass("primary", "h-8.5 text-body")}
        >
          Remix into my projects
        </GoTo>
        <Act
          cta="Vote"
          data-goes-to="SCR-CREATION"
          aria-pressed={creation.voted}
          onClick={onVote}
          className={buttonClass("secondary", "h-8.5 gap-1.75 px-4 text-body")}
        >
          <ArrowBigUp size={14} strokeWidth={1.75} fill={creation.voted ? "currentColor" : "none"} aria-hidden />
          {creation.voted ? "Voted" : "Vote"}
        </Act>
      </div>
      {creation.included.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-card bg-control p-3 text-ui">
          <span className="leading-tight font-semibold">Included</span>
          {creation.included.map((line) => (
            <span key={line} className="flex items-center gap-2.25 leading-tight">
              <Check size={13} strokeWidth={1.75} className="text-ok" aria-hidden />
              {line}
            </span>
          ))}
        </div>
      ) : null}
      <span className="text-ui leading-tight text-fg-tertiary">License: {creation.license}</span>
      <GoTo
        to="MOD-REPORT"
        params={{ creation: creation.id }}
        cta="Report this creation"
        className="flex items-center gap-1 self-start text-ui leading-tight text-fg-tertiary underline hover:text-fg active:opacity-80"
      >
        <Flag size={12} strokeWidth={1.75} aria-hidden />
        Report this creation
      </GoTo>
    </aside>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col rounded-card-sm bg-control px-3 py-2.5">
      <span className="text-title-3 leading-tight font-bold">{value}</span>
      <span className="text-meta leading-tight text-fg-tertiary">{label}</span>
    </div>
  );
}
