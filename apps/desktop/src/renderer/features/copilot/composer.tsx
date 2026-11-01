import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { AutonomyMode, ChatAttachment } from "../../ports/copilot-port.ts";
import { ACCEPTED_FILES } from "./attachment-rules.ts";
import { ComposerAttachments } from "./composer-attachments.tsx";
import { draftAfterSend, draftToSend } from "./composer-draft.ts";
import type { ComposerAttachments as Attachments } from "./use-composer-attachments.ts";

const AUTONOMY_LABEL: Record<AutonomyMode, string> = { ask: "Ask before changes", autopilot: "Autopilot" };

type Props = {
  placeholder: string;
  autonomy: AutonomyMode;
  autonomyNote?: string;
  // A message is on its way; sending again waits until it settles.
  sending?: boolean;
  // Files waiting to go with the next message; without them the composer only sends text (sample data).
  attachments?: Attachments;
  // Resolves true once the copilot has the message; false gives the text back.
  onSend: (text: string, attachments?: readonly ChatAttachment[]) => Promise<boolean>;
  onAutonomy: (mode: AutonomyMode) => void;
};

function sendBlocker(attachments: Attachments | undefined): string | null {
  if (attachments?.busy) {
    return "Wait until the files finish uploading";
  }
  if (attachments?.failed) {
    return "Remove the files that could not be added";
  }
  return null;
}

// Composer: workspace-specific placeholder, + to attach, autonomy mode and the round send button.
export function Composer({
  placeholder,
  autonomy,
  autonomyNote,
  sending = false,
  attachments,
  onSend,
  onAutonomy,
}: Props) {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const blocker = sendBlocker(attachments);
  const send = () => {
    const files = attachments?.ready ?? [];
    const message = blocker
      ? null
      : draftToSend(
          text,
          sending,
          files.map((file) => file.name),
        );
    if (message === null) {
      field.current?.focus();
      return;
    }
    const typed = text.trim();
    setText("");
    void onSend(message, files).then((sent) => {
      if (sent) {
        attachments?.clear();
      }
      setText((current) => draftAfterSend(current, typed, sent));
    });
  };
  return (
    <div className="m-2.5 flex flex-col gap-3 rounded-bubble bg-control pt-3.25 pr-2.5 pb-2.25 pl-3.75">
      {attachments && !sending ? (
        <ComposerAttachments
          drafts={attachments.drafts}
          notice={attachments.notice}
          onRemove={attachments.remove}
          onDismissNotice={attachments.dismissNotice}
        />
      ) : null}
      <input
        ref={field}
        type="text"
        aria-label="Message the copilot"
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            send();
          }
        }}
        onPaste={(event) => {
          const files = [...event.clipboardData.files];
          if (attachments && files.length > 0) {
            event.preventDefault();
            attachments.add(files);
          }
        }}
        className="h-4 bg-transparent text-body leading-4 outline-none placeholder:text-fg-tertiary"
      />
      <div className="flex items-center gap-2 text-ui text-fg-secondary">
        <Act
          cta="Attach"
          aria-label="Attach a file"
          title="Attach images, videos or documents (up to 15 MB each)"
          onClick={() => picker.current?.click()}
          className="grid h-7 w-7 place-items-center rounded-full hover:bg-fill-hover hover:text-fg active:opacity-80"
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden />
        </Act>
        <input
          ref={picker}
          type="file"
          multiple
          accept={ACCEPTED_FILES}
          tabIndex={-1}
          aria-hidden
          className="hidden"
          onChange={(event) => {
            attachments?.add([...(event.currentTarget.files ?? [])]);
            event.currentTarget.value = "";
          }}
        />
        <Act
          cta="Autonomy"
          title="When the copilot asks before changing the project"
          onClick={() => onAutonomy(autonomy === "ask" ? "autopilot" : "ask")}
          className="flex min-w-0 items-center gap-1 rounded-control px-1 py-0.5 hover:bg-fill-hover hover:text-fg active:opacity-80"
        >
          <span className="truncate">
            {autonomyNote ? `${AUTONOMY_LABEL[autonomy]} · ${autonomyNote}` : AUTONOMY_LABEL[autonomy]}
          </span>
          <ChevronDown size={12} strokeWidth={1.75} aria-hidden className="shrink-0" />
        </Act>
        <Act
          cta="Send"
          aria-label="Send"
          title={blocker ?? undefined}
          disabled={sending || blocker !== null}
          onClick={send}
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-full bg-selected text-on-selected hover:opacity-90 active:opacity-80 disabled:opacity-35"
        >
          <ArrowUp size={14} strokeWidth={1.75} aria-hidden />
        </Act>
      </div>
    </div>
  );
}
