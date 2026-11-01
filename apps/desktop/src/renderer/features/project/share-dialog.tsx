// MOD-SHARE
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Act, CloseOverlay, useCloseOverlay } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { useNotices } from "../../app/runtime/notices.ts";
import { usePort } from "../../app/runtime/port.tsx";
import type { ProjectSummary } from "../../ports/projects-port.ts";
import { type ShareSettings, type ShareVisibility, sharePort } from "../../ports/share-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { ActionButton, dialogButtonClass, fieldClass } from "./dialog-controls.tsx";
import { DialogQuery } from "./dialog-query.tsx";
import { useOpenProject, useRefreshAfterAction } from "./open-project.ts";
import { PeopleList } from "./share-people.tsx";

const VISIBILITY: readonly { value: ShareVisibility; label: string }[] = [
  { value: "private", label: "Only me" },
  { value: "invited", label: "People I invite" },
  { value: "link", label: "Anyone with the link" },
];

export function ShareDialog() {
  const project = useOpenProject();
  return (
    <DialogQuery query={project} title="Share" width="w-151.5">
      {(data) => <ShareProject key={data.id} project={data} />}
    </DialogQuery>
  );
}

function ShareProject({ project }: { project: ProjectSummary }) {
  const port = usePort(sharePort);
  const share = useQuery({ queryKey: ["share", project.id], queryFn: () => port.getShare(project.id) });
  return (
    <Dialog title={`Share ${project.name}`} width="w-151.5" footer={<ShareFooter link={share.data?.link} />}>
      <QueryView query={share}>{(settings) => <ShareBody projectId={project.id} settings={settings} />}</QueryView>
    </Dialog>
  );
}

function ShareBody({ projectId, settings }: { projectId: string; settings: ShareSettings }) {
  const port = usePort(sharePort);
  const setVisibility = useEngineAction(port.setVisibility);
  const invite = useEngineAction(port.invite);
  const refresh = useRefreshAfterAction();
  const [email, setEmail] = useState("");
  const address = email.trim();
  const valid = /^[^\s@]+@[^\s@]+$/.test(address);
  return (
    <>
      <div role="radiogroup" aria-label="Who can open it" className="flex gap-0.5 rounded-button bg-control p-0.75">
        {VISIBILITY.map(({ value, label }) => {
          const active = settings.visibility === value;
          return (
            <Act
              key={value}
              cta={label}
              role="radio"
              aria-checked={active}
              aria-current={active ? "true" : undefined}
              onClick={() =>
                void setVisibility.mutateAsync({ projectId, visibility: value }).then(refresh, () => undefined)
              }
              className={
                active
                  ? "rounded-control bg-selected px-3.5 py-1.25 text-ui font-semibold text-on-selected"
                  : "rounded-control px-3.5 py-1.25 text-ui text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80"
              }
            >
              {label}
            </Act>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-ui text-fg-secondary">Link</span>
        <span className="flex h-10 items-center rounded-button bg-control px-3 font-mono text-ui select-all">
          {settings.link}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-ui text-fg-secondary">Invite people</span>
        <div className="flex items-center gap-2">
          <input
            type="email"
            aria-label="Email"
            placeholder="name@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
          />
          <ActionButton
            cta="Invite"
            variant="secondary"
            disabled={!valid}
            title={valid ? undefined : "Type an email address first"}
            run={() => invite.mutateAsync({ projectId, email: address }).then(refresh)}
          >
            Invite
          </ActionButton>
        </div>
      </div>
      <PeopleList projectId={projectId} people={settings.people} />
    </>
  );
}

function ShareFooter({ link }: { link: string | undefined }) {
  const close = useCloseOverlay();
  const screen = useNavigation((state) => state.screen);
  const notify = useNotices((state) => state.notify);
  return (
    <>
      <Act
        cta="Copy link"
        data-goes-to={screen}
        disabled={link === undefined}
        title={link === undefined ? "There is no link yet" : undefined}
        onClick={() => {
          if (link === undefined) {
            return;
          }
          void navigator.clipboard.writeText(`https://${link}`).then(
            () => notify({ title: "Link copied", detail: link }),
            () => notify({ title: "The link could not be copied", detail: link }),
          );
          close();
        }}
        className={dialogButtonClass("secondary")}
      >
        Copy link
      </Act>
      <CloseOverlay cta="Done" className={dialogButtonClass("primary")}>
        Done
      </CloseOverlay>
    </>
  );
}
