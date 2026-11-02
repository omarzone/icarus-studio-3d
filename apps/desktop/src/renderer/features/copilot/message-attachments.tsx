import { ChevronDown, Eye, FileText, ImageOff } from "lucide-react";
import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { ChatAttachment } from "../../ports/copilot-port.ts";
import { formatBytes } from "./attachment-rules.ts";
import { DocumentViewer, ImageViewer } from "./media-viewer.tsx";

type Opened = { attachment: ChatAttachment; as: "image" | "document" } | null;

// Files a sent message carries: a grid of pictures (open large on click), playable videos and document chips.
export function MessageAttachments({ attachments }: { attachments: readonly ChatAttachment[] }) {
  const [opened, setOpened] = useState<Opened>(null);
  const pictures = attachments.filter((item) => item.kind === "image");
  const videos = attachments.filter((item) => item.kind === "video");
  const documents = attachments.filter((item) => item.kind === "document");
  return (
    <div className="flex max-w-[calc(82%+28px)] flex-col items-end gap-1.5 self-end">
      {pictures.length > 0 ? (
        <div className={`grid gap-1.5 ${pictures.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {pictures.map((picture) => (
            <PictureTile
              key={picture.id}
              picture={picture}
              single={pictures.length === 1}
              onOpen={() => setOpened({ attachment: picture, as: "image" })}
            />
          ))}
        </div>
      ) : null}
      {videos.map((video) =>
        video.url ? (
          // biome-ignore lint/a11y/useMediaCaption: people's own clips have no captions to offer.
          <video
            key={video.id}
            src={video.url}
            poster={video.poster ?? undefined}
            controls
            preload="metadata"
            aria-label={video.name}
            className="aspect-video w-60 rounded-card-sm bg-control-raised object-contain"
          />
        ) : (
          <Missing key={video.id} name={video.name} />
        ),
      )}
      {documents.map((document) => (
        <Act
          key={document.id}
          cta="Open file"
          aria-label={`Open ${document.name}`}
          onClick={() => setOpened({ attachment: document, as: "document" })}
          className="flex h-12 max-w-60 items-center gap-2.5 rounded-card-sm bg-control px-3 text-left hover:bg-control-raised active:opacity-80"
        >
          <FileText size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-tertiary" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ui text-fg">{document.name}</span>
            <span className="text-meta text-fg-tertiary">{formatBytes(document.size)}</span>
          </span>
        </Act>
      ))}
      {opened?.as === "image" ? <ImageViewer attachment={opened.attachment} onClose={() => setOpened(null)} /> : null}
      {opened?.as === "document" ? (
        <DocumentViewer attachment={opened.attachment} onClose={() => setOpened(null)} />
      ) : null}
    </div>
  );
}

function PictureTile({ picture, single, onOpen }: { picture: ChatAttachment; single: boolean; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  if (!picture.url || broken) {
    return <Missing name={picture.name} />;
  }
  return (
    <Act
      cta="Open picture"
      aria-label={`Open ${picture.name}`}
      onClick={onOpen}
      className={`overflow-hidden rounded-card-sm bg-control-raised hover:opacity-90 active:opacity-80 ${
        single ? "aspect-4/3 w-60" : "size-28"
      }`}
    >
      <img
        src={picture.url}
        alt={picture.name}
        draggable={false}
        onError={() => setBroken(true)}
        className="size-full object-cover"
      />
    </Act>
  );
}

function Missing({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="flex size-28 flex-col items-center justify-center gap-1 rounded-card-sm bg-control px-2 text-center text-meta text-fg-tertiary"
    >
      <ImageOff size={16} strokeWidth={1.75} aria-hidden />
      <span className="w-full truncate">Not available</span>
    </span>
  );
}

type ViewsProps = {
  views: readonly ChatAttachment[];
  title?: string;
  // Under a copilot answer the strip sits on the left and starts open.
  side?: "user" | "copilot";
};

// The renders of the scene the copilot looked at for a message; under the person's message folded until asked for.
export function SceneViewsStrip({ views, title = "The copilot looked at the scene", side = "user" }: ViewsProps) {
  const [open, setOpen] = useState(side === "copilot");
  const [opened, setOpened] = useState<ChatAttachment | null>(null);
  return (
    <div className={`flex flex-col gap-1.5 ${side === "user" ? "items-end self-end" : "items-start self-start"}`}>
      <Act
        cta={title}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-control px-1 py-0.5 text-meta text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80"
      >
        <Eye size={12} strokeWidth={1.75} aria-hidden />
        {title}
        <ChevronDown size={12} strokeWidth={1.75} aria-hidden className={open ? "rotate-180" : ""} />
      </Act>
      {open ? (
        <div className="flex flex-wrap gap-1.5">
          {views.map((view) =>
            view.url ? (
              <Act
                key={view.id}
                cta="Open view"
                aria-label={`Open ${view.name}`}
                onClick={() => setOpened(view)}
                className="h-18 w-28 overflow-hidden rounded-card-sm bg-control-raised hover:opacity-90 active:opacity-80"
              >
                <img src={view.url} alt={view.name} draggable={false} className="size-full object-cover" />
              </Act>
            ) : null,
          )}
        </div>
      ) : null}
      {opened ? <ImageViewer attachment={opened} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}
