import { Cloud, Flower2, Hand, Move, PackagePlus, Pointer, RotateCcw, Shuffle, Snail, Sun, Wind } from "lucide-react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { PlayTool, PlayToolId } from "../../ports/play-port.ts";

const ICONS = {
  move: Move,
  push: Hand,
  "add-object": PackagePlus,
  light: Sun,
  wind: Wind,
  shadow: Cloud,
  scent: Flower2,
  touch: Pointer,
  shuffle: Shuffle,
  slow: Snail,
  reset: RotateCcw,
} as const satisfies Record<PlayToolId, unknown>;

type Props = { tools: readonly PlayTool[]; selected: PlayToolId; onSelect: (tool: PlayToolId) => void };

// The Play tool bar floating over the viewport: core tools plus the ones the body's senses add.
export function PlayToolBar({ tools, selected, onSelect }: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Play tools"
      className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[14px] bg-overlay p-1"
    >
      {tools.map((tool) => {
        const Icon = ICONS[tool.id];
        const isSelected = tool.id === selected;
        return (
          <Act
            key={tool.id}
            cta={tool.label}
            aria-pressed={isSelected}
            aria-current={isSelected ? "true" : undefined}
            onClick={() => onSelect(tool.id)}
            className={`flex h-11.5 min-w-14 flex-col items-center justify-center gap-1 rounded-button px-1.5 ${
              isSelected ? "bg-selected text-on-selected" : "text-fg-tool hover:bg-fill-hover hover:text-fg"
            }`}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden />
            <span className="text-micro whitespace-nowrap">{tool.label}</span>
          </Act>
        );
      })}
    </div>
  );
}
