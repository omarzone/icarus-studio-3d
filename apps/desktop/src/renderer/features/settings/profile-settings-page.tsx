// SCR-SETTINGS-PROFILE
import { tokens } from "@icarus/ui-tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { accountPort, type Profile } from "../../ports/account-port.ts";
import { Avatar } from "../../ui/avatar.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { Switch } from "../../ui/switch.tsx";
import { TextField } from "../../ui/text-field.tsx";
import { SettingsLayout } from "./settings-layout.tsx";

export function ProfileSettingsPage() {
  const account = usePort(accountPort);
  const query = useQuery({ queryKey: ["profile", null], queryFn: () => account.getProfile(undefined) });
  return (
    <SettingsLayout section="profile" title="Profile" description="How people see you in the community.">
      <QueryView query={query}>{(profile) => <ProfileForm profile={profile} />}</QueryView>
    </SettingsLayout>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const account = usePort(accountPort);
  const client = useQueryClient();
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(`@${profile.handle}`);
  const [location, setLocation] = useState(profile.location);
  const [website, setWebsite] = useState(profile.website);
  const [bio, setBio] = useState(profile.bio);
  const [signatureOn, setSignatureOn] = useState(profile.signatureOn);
  const changePhoto = useEngineAction(account.changePhoto);
  const removePhoto = useEngineAction(account.removePhoto);
  const update = useEngineAction(account.updateProfile);
  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar initials={profile.initials} tone={profile.tone} className="size-18 text-title-1" />
        <span className="flex gap-2">
          <Act
            cta="Change photo"
            onClick={() => changePhoto.mutate(undefined)}
            className={buttonClass("secondary", "h-8.5 px-4 text-body")}
          >
            Change photo
          </Act>
          <Act
            cta="Remove"
            onClick={() => removePhoto.mutate(undefined)}
            className={buttonClass("secondary", "h-8.5 px-4 text-body")}
          >
            Remove
          </Act>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <TextField label="Username" value={handle} onChange={(event) => setHandle(event.target.value)} />
        <TextField label="Location" value={location} onChange={(event) => setLocation(event.target.value)} />
        <TextField label="Website" value={website} onChange={(event) => setWebsite(event.target.value)} />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-ui leading-tight text-fg-secondary">Bio</span>
        <textarea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          className="h-15 resize-none rounded-button bg-control px-3 py-5 leading-tight text-fg outline-none hover:bg-control-raised focus:bg-control-raised"
        />
      </label>
      <div className="flex items-center gap-3.5 rounded-card-sm bg-control p-3.5">
        <span className="flex flex-1 flex-col">
          <span className="leading-tight font-semibold">Signature on my creations</span>
          <span style={{ fontFamily: tokens.font.signature }} className="text-title-2 leading-tight font-normal">
            — {profile.signature}
          </span>
        </span>
        <Switch label="Signature on my creations" checked={signatureOn} onChange={setSignatureOn} />
      </div>
      <div className="flex gap-2">
        <GoTo
          to="SCR-PROFILE"
          cta="Save"
          onClick={() =>
            update.mutate(
              { name, handle: handle.replace(/^@/, ""), location, website, bio, signatureOn },
              { onSuccess: () => client.invalidateQueries({ queryKey: ["profile"] }) },
            )
          }
          className={buttonClass("primary", "h-8.5 text-body")}
        >
          Save
        </GoTo>
      </div>
    </>
  );
}
