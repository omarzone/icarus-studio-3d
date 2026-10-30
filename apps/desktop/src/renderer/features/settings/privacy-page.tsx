// SCR-SETTINGS-PRIVACY
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useRef } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type PrivacyOption, type PrivacySettings, settingsPort } from "../../ports/settings-port.ts";
import { Avatar } from "../../ui/avatar.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { SettingSwitchRow } from "./setting-switch-row.tsx";
import { SettingsLayout } from "./settings-layout.tsx";

const OPTIONS: readonly { option: PrivacyOption; title: string; detail: string }[] = [
  {
    option: "showCreations",
    title: "Show my creations in the community",
    detail: "Only creations you publish, never drafts",
  },
  { option: "allowRemix", title: "Let people remix my creations", detail: "They must credit you" },
  { option: "allowComments", title: "Allow comments", detail: "On your public creations" },
];

export function PrivacyPage() {
  const settings = usePort(settingsPort);
  const query = useQuery({ queryKey: ["settings", "privacy"], queryFn: settings.getPrivacy });
  const blockedRef = useRef<HTMLDivElement>(null);
  return (
    <SettingsLayout
      section="privacy"
      title="Privacy and safety"
      description="You decide what is public. Everything else stays on this computer."
      onLocalItem={(label) => {
        if (label === "Blocked people") {
          blockedRef.current?.scrollIntoView({ block: "start" });
        }
      }}
    >
      <QueryView query={query}>{(privacy) => <PrivacyForm privacy={privacy} blockedRef={blockedRef} />}</QueryView>
    </SettingsLayout>
  );
}

function PrivacyForm({
  privacy,
  blockedRef,
}: {
  privacy: PrivacySettings;
  blockedRef: RefObject<HTMLDivElement | null>;
}) {
  const settings = usePort(settingsPort);
  const client = useQueryClient();
  const store = { onSuccess: (next: PrivacySettings) => client.setQueryData(["settings", "privacy"], next) };
  const setPrivacy = useEngineAction(settings.setPrivacy);
  const unblock = useEngineAction(settings.unblock);
  const download = useEngineAction(settings.downloadMyData);
  const deleteAccount = useEngineAction(settings.deleteAccount);
  return (
    <>
      {OPTIONS.map(({ option, title, detail }) => (
        <SettingSwitchRow
          key={option}
          title={title}
          detail={detail}
          checked={privacy[option]}
          onChange={(value) => setPrivacy.mutate({ option, value }, store)}
        />
      ))}
      <div ref={blockedRef} className="mt-1 flex flex-col gap-4">
        <span className="leading-tight font-semibold">Blocked people</span>
        {privacy.blocked.length === 0 ? (
          <span className="text-fg-tertiary">Nobody is blocked.</span>
        ) : (
          privacy.blocked.map((person) => (
            <div key={person.handle} className="flex items-center gap-2.5 rounded-card-sm bg-control px-3 py-2.5">
              <Avatar initials={person.initials} tone={person.tone} className="size-7.5 text-meta" />
              <span className="flex-1">@{person.handle}</span>
              <Act
                cta="Unblock"
                onClick={() => unblock.mutate(person.handle, store)}
                className={buttonClass("secondary", "h-8.5 px-4 text-body")}
              >
                Unblock
              </Act>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Act
          cta="Download my data"
          onClick={() => download.mutate(undefined)}
          className={buttonClass("secondary", "h-8.5 px-4 text-body")}
        >
          Download my data
        </Act>
        <Act
          cta="Delete account"
          onClick={() => deleteAccount.mutate(undefined)}
          className="inline-flex h-8.5 items-center rounded-button px-4 text-body text-danger hover:bg-danger-tint active:opacity-80"
        >
          Delete account
        </Act>
      </div>
    </>
  );
}
