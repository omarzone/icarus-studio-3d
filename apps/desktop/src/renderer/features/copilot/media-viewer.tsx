import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type ChatAttachment, copilotPort } from "../../ports/copilot-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { useEscape } from "../../ui/dialog.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { formatBytes } from "./attachment-rules.ts";

type ViewerProps = { attachment: ChatAttachment; onClose: () => void };

// A sent picture or document opened over the app: Escape, × or a click outside close it.
function Viewer({ attachment, onClose, children }: ViewerProps & { children: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim-modal p-6">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={attachment.name}
        className="relative flex max-h-full max-w-full flex-col gap-3 rounded-dialog border border-line-strong bg-panel p-4 shadow-dialog"
      >
        <header className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-ui font-semibold">{attachment.name}</p>
          <span className="text-meta text-fg-tertiary">{formatBytes(attachment.size)}</span>
          <Act cta="Close" aria-label="Close" onClick={onClose} className={buttonClass("icon", "-my-1 -mr-1")}>
            <X size={16} strokeWidth={1.75} aria-hidden />
          </Act>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ImageViewer({ attachment, onClose }: ViewerProps) {
  return (
    <Viewer attachment={attachment} onClose={onClose}>
      {attachment.url ? (
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-[calc(100vh-140px)] max-w-[calc(100vw-80px)] rounded-card-sm object-contain"
        />
      ) : (
        <EmptyState title="No picture" body="This file has nothing to show." />
      )}
    </Viewer>
  );
}

export function DocumentViewer({ attachment, onClose }: ViewerProps) {
  const port = usePort(copilotPort);
  const query = useQuery({
    queryKey: ["copilot-attachment-text", attachment.id],
    queryFn: () => port.readAttachmentText(attachment.id),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  return (
    <Viewer attachment={attachment} onClose={onClose}>
      <div className="h-[min(560px,calc(100vh-140px))] w-[min(720px,calc(100vw-80px))] overflow-auto rounded-control bg-control">
        <QueryView
          query={query}
          errorTitle="This file could not be opened"
          isEmpty={(text) => text.trim() === ""}
          empty={
            <EmptyState
              title="No text to show"
              body={
                attachment.mediaType === "application/pdf"
                  ? "PDF text is not read in the app; the copilot got the file by its name."
                  : "This document is empty."
              }
            />
          }
        >
          {(text) => (
            <pre className="px-3.5 py-3 font-mono text-mono whitespace-pre-wrap wrap-break-word text-fg-secondary">
              {text}
            </pre>
          )}
        </QueryView>
      </div>
    </Viewer>
  );
}
