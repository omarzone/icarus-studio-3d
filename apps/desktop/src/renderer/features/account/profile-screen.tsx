// SCR-PROFILE
import { tokens } from "@icarus/ui-tokens";
import { useQuery } from "@tanstack/react-query";
import { ArrowBigUp, Plus } from "lucide-react";
import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import {
  accountPort,
  type Profile,
  type ProfileCreation,
  type ProfileCreationStatus,
  type ProfileShelf,
} from "../../ports/account-port.ts";
import { Avatar } from "../../ui/avatar.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { LauncherPage } from "../../ui/launcher-page.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { Segmented } from "../../ui/segmented.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { type PillTone, StatusPill } from "../../ui/status-pill.tsx";

const SHELVES: readonly { shelf: ProfileShelf; label: string }[] = [
  { shelf: "creations", label: "My creations" },
  { shelf: "remixes", label: "Remixes" },
  { shelf: "liked", label: "Liked" },
  { shelf: "drafts", label: "Drafts" },
];

const STATUS: Record<ProfileCreationStatus, { label: string; tone: PillTone }> = {
  review: { label: "In review", tone: "warn" },
  public: { label: "Public", tone: "ok" },
  private: { label: "Private", tone: "neutral" },
};

export function ProfileScreen() {
  const handle = useNavigation((state) => state.params.user);
  const account = usePort(accountPort);
  const query = useQuery({ queryKey: ["profile", handle ?? null], queryFn: () => account.getProfile(handle) });
  return (
    <LauncherPage active="Home" activeGoesTo="SCR-HOME">
      <QueryView query={query}>{(profile) => <ProfilePage profile={profile} />}</QueryView>
    </LauncherPage>
  );
}

function ProfilePage({ profile }: { profile: Profile }) {
  const account = usePort(accountPort);
  const follow = useEngineAction(account.follow);
  const [shelf, setShelf] = useState<ProfileShelf>("creations");
  const creations = useQuery({
    queryKey: ["profile", profile.handle, shelf],
    queryFn: () => account.listProfileCreations({ handle: profile.own ? undefined : profile.handle, shelf }),
  });
  const about = [`@${profile.handle}`, profile.bio, profile.location].filter((part) => part !== "").join(" · ");
  return (
    <div className="flex flex-col gap-5.5 pt-2.5">
      <div className="flex items-center gap-5">
        <Avatar initials={profile.initials} tone={profile.tone} className="size-24 text-4xl" />
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-title-1 leading-tight font-bold">{profile.name}</h1>
          <span className="leading-tight text-fg-tertiary">{about}</span>
          {profile.signatureOn ? (
            <span style={{ fontFamily: tokens.font.signature }} className="text-title-2 leading-tight text-fg-tool">
              — {profile.signature}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex gap-2">
          {profile.own ? (
            <>
              <GoTo
                to="SCR-SETTINGS-MODELS"
                cta="Edit profile"
                className={buttonClass("secondary", "h-8.5 px-4 text-body")}
              >
                Edit profile
              </GoTo>
              <GoTo
                to="STA-WORLD-EMPTY"
                cta="New creation"
                className={buttonClass("primary", "h-8.5 gap-1.75 text-body")}
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                New creation
              </GoTo>
            </>
          ) : (
            <Act
              cta="Follow"
              onClick={() => follow.mutate(profile.handle)}
              className={buttonClass("primary", "h-8.5 text-body")}
            >
              Follow
            </Act>
          )}
        </div>
      </div>
      <div className="flex gap-7">
        <Stat value={profile.stats.creations} label="creations" />
        <Stat value={profile.stats.votes} label="votes received" />
        <Stat value={profile.stats.remixes} label="remixes of your work" />
        <Stat value={profile.stats.followers} label="followers" />
      </div>
      <Segmented
        items={SHELVES.map((item) => ({
          label: item.label,
          active: item.shelf === shelf,
          onSelect: () => setShelf(item.shelf),
        }))}
      />
      <QueryView
        query={creations}
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState title="Nothing here yet" body="Creations appear here once they are made or saved." />}
      >
        {(list) => (
          <div className="grid grid-cols-4 gap-4">
            {list.map((creation) => (
              <ProfileCard key={creation.id} creation={creation} />
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-title-3 leading-tight font-bold">{value}</span>
      <span className="text-ui leading-tight text-fg-tertiary">{label}</span>
    </span>
  );
}

function ProfileCard({ creation }: { creation: ProfileCreation }) {
  const status = STATUS[creation.status];
  const showVotes = creation.status === "public";
  return (
    <GoTo
      to="SCR-CREATION"
      params={{ creation: creation.id }}
      cta={`${creation.name}\n${status.label}${showVotes ? ` ·\n${creation.votes}` : ""}`}
      className="flex flex-col overflow-hidden rounded-card bg-control text-left hover:bg-control-raised active:opacity-80"
    >
      <span aria-hidden className="h-42.5 w-full bg-control-raised" />
      <span className="flex items-center gap-2 px-3.5 py-3">
        <span className="flex-1 leading-tight font-semibold">{creation.name}</span>
        <StatusPill tone={status.tone}>
          {status.label}
          {showVotes ? (
            <>
              {" ·"}
              <ArrowBigUp size={12} strokeWidth={1.75} aria-hidden />
              {creation.votes}
            </>
          ) : null}
        </StatusPill>
      </span>
    </GoTo>
  );
}
