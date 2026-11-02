// TAB-NOTES
import { useState } from "react";
import { useRuntimeMode } from "../../../app/runtime/port.tsx";

// Free notes about the runs, saved when the field loses focus.
export function NotesTab({ notes, onSave }: { notes: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(notes);
  // In the app notes are kept on this computer only; the copilot does not write them.
  const app = useRuntimeMode() === "app";
  return (
    <div className="flex h-full flex-col p-3">
      <textarea
        aria-label="Notes"
        placeholder={
          app
            ? "Write what you noticed. Notes are kept on this computer…"
            : "Write what you noticed, or ask the copilot to add its own notes…"
        }
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        onBlur={() => {
          if (text !== notes) {
            onSave(text);
          }
        }}
        className="min-h-0 flex-1 resize-none rounded-button bg-control p-3 text-body outline-none placeholder:text-fg-tertiary hover:bg-control-raised focus:bg-control-raised"
      />
    </div>
  );
}
