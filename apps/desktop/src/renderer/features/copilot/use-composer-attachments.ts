import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatAttachment } from "../../ports/copilot-port.ts";
import { type ReadFile, readFile } from "./attachment-reading.ts";
import { checkAttachment, type FileKind } from "./attachment-rules.ts";

export type DraftStatus = "reading" | "uploading" | "ready" | "failed";

// A file in the composer before the message goes: its preview, and how far its upload got.
export type DraftAttachment = {
  localId: string;
  kind: FileKind;
  name: string;
  size: number;
  // A local picture of it (image, or a video's first frame) while it is not sent yet.
  preview: string | null;
  duration?: number;
  status: DraftStatus;
  error?: string;
  attachment?: ChatAttachment;
};

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : "The file could not be added");

// Files are read and uploaded as soon as they are added, so the message goes as soon as it is written.
export function useComposerAttachments(upload: (file: ReadFile) => Promise<ChatAttachment>) {
  const [drafts, setDrafts] = useState<readonly DraftAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const counter = useRef(0);
  const objectUrls = useRef(new Map<string, string>());
  const count = useRef(0);
  count.current = drafts.length;

  const patch = useCallback((localId: string, change: Partial<DraftAttachment>) => {
    setDrafts((current) => current.map((draft) => (draft.localId === localId ? { ...draft, ...change } : draft)));
  }, []);

  const release = useCallback((localId: string) => {
    const url = objectUrls.current.get(localId);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.current.delete(localId);
    }
  }, []);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls.values()) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  const add = useCallback(
    (files: readonly File[]) => {
      const refused: string[] = [];
      let attached = count.current;
      for (const file of files) {
        const check = checkAttachment(file, attached);
        if (!check.ok) {
          refused.push(check.reason);
          continue;
        }
        attached += 1;
        counter.current += 1;
        const localId = `draft-${counter.current}`;
        let preview: string | null = null;
        if (check.kind === "image") {
          preview = URL.createObjectURL(file);
          objectUrls.current.set(localId, preview);
        }
        const draft: DraftAttachment = {
          localId,
          kind: check.kind,
          name: file.name,
          size: file.size,
          preview,
          status: "reading",
        };
        setDrafts((current) => [...current, draft]);
        void readFile(file, check)
          .then((read) => {
            const frame = read.frames?.[0];
            patch(localId, {
              status: "uploading",
              ...(frame ? { preview: `data:image/jpeg;base64,${frame}` } : {}),
              ...(read.duration !== undefined ? { duration: read.duration } : {}),
            });
            return upload(read);
          })
          .then(
            (attachment) => patch(localId, { status: "ready", attachment }),
            (error: unknown) => patch(localId, { status: "failed", error: reasonOf(error) }),
          );
      }
      setNotice(refused.length > 0 ? refused.join(". ") : null);
    },
    [patch, upload],
  );

  const remove = useCallback(
    (localId: string) => {
      release(localId);
      setDrafts((current) => current.filter((draft) => draft.localId !== localId));
      setNotice(null);
    },
    [release],
  );

  // After the message is sent the previews go with it; the sent message shows the engine's copies.
  const clear = useCallback(() => {
    for (const localId of objectUrls.current.keys()) {
      release(localId);
    }
    setDrafts([]);
    setNotice(null);
  }, [release]);

  const busy = drafts.some((draft) => draft.status === "reading" || draft.status === "uploading");
  const failed = drafts.some((draft) => draft.status === "failed");
  const ready = drafts.flatMap((draft) => (draft.attachment ? [draft.attachment] : []));
  return { drafts, notice, add, remove, clear, busy, failed, ready, dismissNotice: () => setNotice(null) };
}

export type ComposerAttachments = ReturnType<typeof useComposerAttachments>;
