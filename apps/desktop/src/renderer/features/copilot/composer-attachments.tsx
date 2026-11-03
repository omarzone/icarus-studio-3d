import { AlertCircle, FileText, Film, LoaderCircle, X } from "lucide-react";
import { Act } from "../../app/navigation/go-to.tsx";
import { formatBytes } from "./attachment-rules.ts";
import type { DraftAttachment } from "./use-composer-attachments.ts";
import { formatDuration } from "./video-frames.ts";

type Props = {
  drafts: readonly DraftAttachment[];
  notice: string | null;
  onRemove: (localId: string) => void;
  onDismissNotice: () => void;
};

const STATUS_LABEL: Record<DraftAttachment["status"], string> = {
  reading: "Reading…",
  uploading: "Uploading…",
  ready: "",
  failed: "Not added",
};

// Files waiting in the composer: thumbnails for pictures and videos, chips for documents, each removable.
export function ComposerAttachments({ drafts, notice, onRemove, onDismissNotice }: Props) {
  if (drafts.length === 0 && !notice) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {drafts.length > 0 ? (
        <ul aria-label="Files to send" className="flex flex-wrap gap-2">
          {drafts.map((draft) => (
            <li key={draft.localId}>
              <DraftTile draft={draft} onRemove={() => onRemove(draft.localId)} />
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? (
        <p role="alert" className="flex items-start gap-1.5 text-meta text-danger">
          <AlertCircle size={12} strokeWidth={1.75} aria-hidden className="mt-px shrink-0" />
          <span className="min-w-0 flex-1 wrap-break-word">{notice}</span>
          <Act
            cta="Dismiss"
            aria-label="Dismiss"
            onClick={onDismissNotice}
            className="grid size-4 shrink-0 place-items-center rounded-full text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80"
          >
            <X size={10} strokeWidth={1.75} aria-hidden />
          </Act>
        </p>
      ) : null}
    </div>
  );
}

function DraftTile({ draft, onRemove }: { draft: DraftAttachment; onRemove: () => void }) {
  const busy = draft.status === "reading" || draft.status === "uploading";
  const failed = draft.status === "failed";
  const status = failed && draft.error ? draft.error : STATUS_LABEL[draft.status];
  const pictured = draft.kind === "image" || draft.kind === "video";
  return (
    <div
      title={status ? `${draft.name} · ${status}` : draft.name}
      className={`group relative flex items-center overflow-hidden rounded-card-sm bg-control-raised ${
        failed ? "ring-1 ring-danger" : ""
      } ${pictured ? "size-14" : "h-14 max-w-52 gap-2 pr-7 pl-2.5"}`}
    >
      {pictured ? (
        <>
          {draft.preview ? (
            <img src={draft.preview} alt={draft.name} draggable={false} className="size-full object-cover" />
          ) : (
            <span aria-hidden className="grid size-full place-items-center text-fg-tertiary">
              <Film size={16} strokeWidth={1.75} />
            </span>
          )}
          {draft.kind === "video" && draft.duration !== undefined ? (
            <span className="absolute bottom-1 left-1 rounded-bar bg-overlay px-1 text-micro text-fg">
              {formatDuration(draft.duration)}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <FileText size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-tertiary" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ui text-fg">{draft.name}</span>
            <span className="truncate text-meta text-fg-tertiary">{failed ? status : formatBytes(draft.size)}</span>
          </span>
        </>
      )}
      {busy ? (
        <span role="status" aria-label={status} className="absolute inset-0 grid place-items-center bg-scrim-popover">
          <LoaderCircle size={16} strokeWidth={1.75} aria-hidden className="animate-spin text-fg" />
        </span>
      ) : null}
      {failed && pictured ? (
        <span aria-hidden className="absolute inset-0 grid place-items-center bg-scrim-modal text-danger">
          <AlertCircle size={16} strokeWidth={1.75} />
        </span>
      ) : null}
      <Act
        cta="Remove file"
        aria-label={`Remove ${draft.name}`}
        onClick={onRemove}
        className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-overlay text-fg-secondary hover:bg-control-raised hover:text-fg active:opacity-80"
      >
        <X size={12} strokeWidth={1.75} aria-hidden />
      </Act>
    </div>
  );
}
