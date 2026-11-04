// TAB-SHARE-TO-COMMUNITY
import type { SceneDescription } from "@icarus/contracts";
import { ArrowBigUp, Check } from "lucide-react";
import { useState } from "react";
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";
import type { CommunityPage, PublishPermissionId } from "../../../ports/publish-port.ts";
import { SceneThumbnail } from "../../../scene/scene-thumbnail.tsx";
import { buttonClass } from "../../../ui/button-styles.ts";
import { CheckLine } from "../../copilot/chat-messages.tsx";

type Props = {
  page: CommunityPage;
  project: string;
  // The project's compiled scene for the preview card; `load` is null where there is none (sample data).
  picture: { cacheKey: string; load: (() => Promise<SceneDescription>) | null };
  // While a dialog is open over Build, Save draft leads back to it.
  underOverlay: boolean;
  onEdit: (edit: { title?: string; description?: string }) => void;
  onPermission: (id: PublishPermissionId, on: boolean) => void;
  onSaveDraft: () => void;
};

const fieldClass =
  "w-full rounded-button bg-control px-3 py-2.25 text-body leading-[1.45] text-fg outline-none placeholder:text-fg-tertiary hover:bg-control-raised focus:bg-control-raised";

const chipClass =
  "inline-flex h-6.5 items-center rounded-full bg-fill-hover px-2.5 text-ui text-fg-tool hover:bg-control-raised hover:text-fg active:opacity-80";

// The community page form: title, description, what people can do, what is included and the preview card.
export function ShareToCommunityTab({
  page,
  project,
  picture,
  underOverlay,
  onEdit,
  onPermission,
  onSaveDraft,
}: Props) {
  const [title, setTitle] = useState(page.title);
  const [description, setDescription] = useState(page.description);
  return (
    <div className="grid h-full grid-cols-2 gap-4 p-4">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-ui leading-[15px] text-fg-secondary">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => title !== page.title && onEdit({ title })}
            className={`${fieldClass} h-13.5`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-ui leading-[15px] text-fg-secondary">Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => description !== page.description && onEdit({ description })}
            className={`${fieldClass} h-23.5 resize-none`}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-ui leading-[15px] text-fg-secondary">What people can do</span>
          <div className="flex flex-wrap gap-1.5">
            {page.permissions.map((permission) => (
              <Act
                key={permission.id}
                cta={permission.label}
                role="switch"
                aria-checked={permission.on}
                onClick={() => onPermission(permission.id, !permission.on)}
                className={chipClass}
              >
                {permission.on ? <Check size={12} strokeWidth={1.75} aria-hidden /> : null}
                {permission.on ? " " : null}
                {permission.label}
              </Act>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-ui leading-[15px] text-fg-secondary">Included</span>
          {page.included.map((item) => (
            <CheckLine key={item} item={{ text: item, tone: "ok" }} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-ui leading-[15px] text-fg-secondary">Preview card</span>
        <div className="overflow-hidden rounded-[18px] bg-control">
          <div role="img" aria-label={`Community preview of ${project}`} className="h-50 bg-control-raised">
            {picture.load ? (
              <SceneThumbnail cacheKey={picture.cacheKey} load={picture.load} className="size-full" />
            ) : null}
          </div>
          <div className="flex items-center gap-2 px-3.5 py-3">
            <span className="flex flex-1 flex-col">
              <span className="leading-4 font-semibold">{page.title}</span>
              <span className="text-ui leading-[15px] text-fg-tertiary">{page.preview.byline}</span>
            </span>
            <span className="inline-flex h-6.5 items-center gap-0.5 rounded-full bg-fill-hover px-2.5 text-ui text-fg-tool">
              <ArrowBigUp size={12} strokeWidth={1.75} aria-label="Votes" />
              {page.preview.votes}
            </span>
          </div>
        </div>
        <div className="mt-auto flex gap-2">
          {underOverlay ? (
            <GoTo to="SCR-BUILD" cta="Save draft" className={buttonClass("secondary")}>
              Save draft
            </GoTo>
          ) : (
            <Act cta="Save draft" onClick={onSaveDraft} className={buttonClass("secondary")}>
              Save draft
            </Act>
          )}
          <GoTo to="MOD-PUBLISH" cta="Publish to community" className={buttonClass("primary", "px-3.75")}>
            Publish to community
          </GoTo>
        </div>
      </div>
    </div>
  );
}
