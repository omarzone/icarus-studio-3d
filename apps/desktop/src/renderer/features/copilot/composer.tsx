import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { AutonomyMode } from "../../ports/copilot-port.ts";

const AUTONOMY_LABEL: Record<AutonomyMode, string> = { ask: "Ask before changes", autopilot: "Autopilot" };

type Props = {
  placeholder: string;
  autonomy: AutonomyMode;
  onSend: (text: string) => void;
  onAttach: () => void;
  onAutonomy: (mode: AutonomyMode) => void;
};

// Composer: workspace-specific placeholder, + to attach, autonomy mode and the round send button.
export function Composer({ placeholder, autonomy, onSend, onAttach, onAutonomy }: Props) {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const send = () => {
    const message = text.trim();
    if (!message) {
      field.current?.focus();
      return;
    }
    onSend(message);
    setText("");
  };
  return (
    <div className="m-2.5 flex flex-col gap-3 rounded-bubble bg-control pt-3.25 pr-2.5 pb-2.25 pl-3.75">
      <input
        ref={field}
        type="text"
        aria-label="Message the copilot"
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            send();
          }
        }}
        className="h-4 bg-transparent text-body leading-4 outline-none placeholder:text-fg-tertiary"
      />
      <div className="flex items-center gap-2 text-ui text-fg-secondary">
        <Act
          cta="Attach"
          aria-label="Attach a file"
          title="Attach a file"
          onClick={onAttach}
          className="grid h-7 w-7 place-items-center rounded-full hover:bg-fill-hover hover:text-fg"
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden />
        </Act>
        <Act
          cta="Autonomy"
          title="When the copilot asks before changing the project"
          onClick={() => onAutonomy(autonomy === "ask" ? "autopilot" : "ask")}
          className="flex items-center gap-1 rounded-control px-1 py-0.5 hover:bg-fill-hover hover:text-fg"
        >
          {AUTONOMY_LABEL[autonomy]}
          <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
        </Act>
        <Act
          cta="Send"
          aria-label="Send"
          onClick={send}
          className="ml-auto grid size-8 place-items-center rounded-full bg-selected text-on-selected hover:opacity-90"
        >
          <ArrowUp size={14} strokeWidth={1.75} aria-hidden />
        </Act>
      </div>
    </div>
  );
}
