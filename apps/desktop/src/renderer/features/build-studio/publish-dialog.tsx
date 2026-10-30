// MOD-PUBLISH
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Act, CloseOverlay } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type PublishReadiness, publishPort } from "../../ports/publish-port.ts";
import { Avatar } from "../../ui/avatar.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { Switch } from "../../ui/switch.tsx";
import { CheckLine } from "../copilot/chat-messages.tsx";
import { DialogTitle, dialogButton } from "./dialog-button.tsx";
import { type BuildProject, useBuildProject } from "./use-build-project.ts";

const GUIDELINES =
  "I follow the community guidelines. New creations get a quick automatic review before they are public.";

const readinessKey = (project: string) => ["publish", "readiness", project] as const;

export function PublishDialog() {
  const project = useBuildProject();
  const port = usePort(publishPort);
  const readiness = useQuery({ queryKey: readinessKey(project.id), queryFn: () => port.getReadiness(project.id) });
  return (
    <Dialog
      title={<DialogTitle text="Publish to the community" />}
      width="w-146.5"
      footer={<PublishFooter project={project.id} readiness={readiness.data} />}
    >
      <QueryView query={readiness}>{(data) => <PublishBody project={project} readiness={data} />}</QueryView>
    </Dialog>
  );
}

function PublishBody({ project, readiness }: { project: BuildProject; readiness: PublishReadiness }) {
  const port = usePort(publishPort);
  const client = useQueryClient();
  const accept = useEngineAction(port.acceptGuidelines);
  const { author } = readiness;
  return (
    <>
      <p className="-mt-0.75 leading-normal text-fg-secondary">
        {project.name} will appear in the community with your name and photo. {readiness.reach}
      </p>
      <div className="flex items-center gap-3 rounded-card-sm bg-control p-3">
        <Avatar initials={author.initials} tone={author.tone} className="size-10 text-headline" />
        <span className="flex flex-col">
          <span className="leading-4 font-semibold">{author.name}</span>
          <span className="text-ui leading-[15px] text-fg-tertiary">
            @{author.handle}
            {author.signature ? ` · signed “${author.signature}”` : ""}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {readiness.checks.map((check) => (
          <CheckLine key={check.text} item={{ text: check.text, tone: check.ok ? "ok" : "warn" }} />
        ))}
      </div>
      <div className="flex items-start gap-2.5">
        <Switch
          label="I follow the community guidelines"
          checked={readiness.guidelinesAccepted}
          onChange={(accepted) =>
            accept.mutate(
              { project: project.id, accepted },
              { onSuccess: (next) => client.setQueryData(readinessKey(project.id), next) },
            )
          }
        />
        <span className="text-ui leading-normal text-fg-secondary">{GUIDELINES}</span>
      </div>
    </>
  );
}

function PublishFooter({ project, readiness }: { project: string; readiness: PublishReadiness | undefined }) {
  const port = usePort(publishPort);
  const publish = useEngineAction(port.publish);
  const client = useQueryClient();
  const go = useNavigation((state) => state.go);
  const blocked = !readiness
    ? "Checking the creation first"
    : !readiness.checks.every((check) => check.ok)
      ? "Fix the checks above first"
      : !readiness.guidelinesAccepted
        ? "Agree to the community guidelines first"
        : undefined;
  return (
    <>
      <CloseOverlay cta="Back" className={dialogButton("secondary")}>
        Back
      </CloseOverlay>
      <Act
        cta="Publish"
        data-goes-to="MOD-PUBLISHED"
        disabled={blocked !== undefined}
        title={blocked}
        onClick={() =>
          publish.mutate(project, {
            onSuccess: (review) => {
              client.setQueryData(["publish", "review", project], review);
              go("MOD-PUBLISHED");
            },
          })
        }
        className={dialogButton("primary")}
      >
        Publish
      </Act>
    </>
  );
}
