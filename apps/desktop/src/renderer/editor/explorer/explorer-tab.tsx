// TAB-EXPLORER
import { Act } from "../../app/navigation/go-to.tsx";
import type { SceneObject, SceneTree } from "../../ports/scene-port.ts";
import { SCENE_ICONS } from "../scene-icons.ts";

type Props = { tree: SceneTree; onSelect: (id: string) => void; onAction?: (row: SceneObject) => void };

const INDENT = ["pl-5.5", "pl-9", "pl-12.5", "pl-16"] as const;

// The project's scene tree grouped in sections; rows select, action rows act.
export function ExplorerTab({ tree, onSelect, onAction }: Props) {
  return (
    <div role="tree" className="flex flex-col px-1.5 py-1">
      {tree.sections.map((section) => (
        <div key={section.label} className="flex flex-col">
          <p className="px-2.5 pt-2.5 pb-1 text-meta text-fg-tertiary">{section.label}</p>
          {section.objects.map((row) => (
            <ExplorerRow
              key={row.id}
              row={row}
              selected={row.id === tree.selected}
              onClick={() => (row.action ? onAction?.(row) : onSelect(row.id))}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ExplorerRow({ row, selected, onClick }: { row: SceneObject; selected: boolean; onClick: () => void }) {
  const Icon = SCENE_ICONS[row.icon];
  const indent = INDENT[Math.min(row.depth, INDENT.length - 1)];
  const tone = row.proposed ? "text-proposal" : "text-fg";
  return (
    <Act
      cta={row.name}
      role="treeitem"
      aria-selected={selected}
      onClick={onClick}
      className={`flex h-6.5 w-full items-center gap-2 rounded-control pr-2 text-left text-body ${indent} ${
        selected ? "bg-control-raised" : "hover:bg-fill-hover"
      }`}
    >
      <span className="grid w-4 shrink-0 place-items-center text-fg-tertiary">
        <Icon size={row.action ? 12 : 14} strokeWidth={1.75} aria-hidden />
      </span>
      <span className={`min-w-0 flex-1 truncate ${tone}`}>{row.name}</span>
      {row.meta ? <span className="shrink-0 text-meta text-fg-tertiary">{row.meta}</span> : null}
    </Act>
  );
}
