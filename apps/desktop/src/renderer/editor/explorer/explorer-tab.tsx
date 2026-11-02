// TAB-EXPLORER
import { type DragEvent, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { SceneObject, SceneTree } from "../../ports/scene-port.ts";
import { SCENE_ICONS } from "../scene-icons.ts";
import { canDrop } from "./explorer-drag.ts";
import { ObjectMenu } from "./object-menu.tsx";

// What can be done to an object from its row; without them rows only select.
export type ExplorerActions = {
  rename: (id: string, name: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  ask: (row: SceneObject) => void;
  // Nests the object under another of its section, or at the top of it (null).
  reparent: (id: string, parent: string | null) => void;
};

type Props = {
  tree: SceneTree;
  onSelect: (id: string) => void;
  onAction?: (row: SceneObject) => void;
  actions?: ExplorerActions;
};

const INDENT = ["pl-5.5", "pl-9", "pl-12.5", "pl-16"] as const;
const DRAG_TYPE = "application/x-icarus-object";
const DROP_LOOK = "bg-fill-hover outline-1 outline-line-strong";

type Drag = { id: string; section: string };

// The project's scene tree grouped in sections; rows select, action rows act. With `actions`, a right-click opens
// the object's menu and dragging a row onto another nests it there (onto a section title: back to the top).
export function ExplorerTab({ tree, onSelect, onAction, actions }: Props) {
  const [menu, setMenu] = useState<{ row: SceneObject; element: HTMLElement } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dropHandlers = (section: string, target: string | null) => {
    const key = target ?? `section:${section}`;
    const allowed = drag !== null && canDrop(tree, drag.id, section, target);
    return {
      highlighted: allowed && over === key,
      onDragOver: (event: DragEvent) => {
        if (allowed) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setOver(key);
        }
      },
      onDragLeave: () => setOver((current) => (current === key ? null : current)),
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        if (allowed && drag) {
          actions?.reparent(drag.id, target);
        }
        setDrag(null);
        setOver(null);
      },
    };
  };
  return (
    <div role="tree" className="flex flex-col px-1.5 py-1">
      {tree.sections.map((section) => {
        const title = dropHandlers(section.label, null);
        return (
          <div key={section.label} className="flex flex-col">
            <p
              onDragOver={title.onDragOver}
              onDragLeave={title.onDragLeave}
              onDrop={title.onDrop}
              className={`rounded-control px-2.5 pt-2.5 pb-1 text-meta text-fg-tertiary ${title.highlighted ? DROP_LOOK : ""}`}
            >
              {section.label}
            </p>
            {section.objects.map((row) => {
              const drop = dropHandlers(section.label, row.id);
              const editable = actions !== undefined && !row.action;
              if (renaming === row.id && actions) {
                return (
                  <RenameField
                    key={row.id}
                    row={row}
                    onDone={(name) => {
                      setRenaming(null);
                      const trimmed = name?.trim();
                      if (trimmed && trimmed !== row.name) {
                        actions.rename(row.id, trimmed);
                      }
                    }}
                  />
                );
              }
              return (
                <ExplorerRow
                  key={row.id}
                  row={row}
                  selected={row.id === tree.selected}
                  highlighted={drop.highlighted}
                  onClick={() => (row.action ? onAction?.(row) : onSelect(row.id))}
                  {...(editable
                    ? {
                        draggable: true,
                        "data-own-drag": true,
                        onDragStart: (event: DragEvent) => {
                          event.dataTransfer.setData(DRAG_TYPE, row.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDrag({ id: row.id, section: section.label });
                        },
                        onDragEnd: () => {
                          setDrag(null);
                          setOver(null);
                        },
                        onDragOver: drop.onDragOver,
                        onDragLeave: drop.onDragLeave,
                        onDrop: drop.onDrop,
                        onContextMenu: (event) => {
                          event.preventDefault();
                          onSelect(row.id);
                          setMenu({ row, element: event.currentTarget });
                        },
                        onKeyDown: (event: KeyboardEvent) => {
                          if (event.key === "F2") {
                            event.preventDefault();
                            setRenaming(row.id);
                          } else if (event.key === "Delete") {
                            event.preventDefault();
                            actions.remove(row.id);
                          }
                        },
                      }
                    : {})}
                />
              );
            })}
          </div>
        );
      })}
      {menu && actions ? (
        <ObjectMenu
          row={menu.element}
          name={menu.row.name}
          onClose={() => setMenu(null)}
          actions={{
            rename: () => setRenaming(menu.row.id),
            duplicate: () => actions.duplicate(menu.row.id),
            remove: () => actions.remove(menu.row.id),
            ask: () => actions.ask(menu.row),
          }}
        />
      ) : null}
    </div>
  );
}

type RowProps = {
  row: SceneObject;
  selected: boolean;
  highlighted: boolean;
  onClick: () => void;
  draggable?: boolean;
  // Tells the docked workspace this drag is the row's own, not a panel being moved.
  "data-own-drag"?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent) => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
};

function ExplorerRow({ row, selected, highlighted, ...handlers }: RowProps) {
  const Icon = SCENE_ICONS[row.icon];
  const indent = INDENT[Math.min(row.depth, INDENT.length - 1)];
  const tone = row.proposed ? "text-proposal" : "text-fg";
  const look = highlighted
    ? DROP_LOOK
    : selected
      ? "bg-control-raised"
      : "hover:bg-fill-hover active:bg-control-raised";
  return (
    <Act
      cta={row.name}
      role="treeitem"
      aria-selected={selected}
      {...handlers}
      className={`flex h-6.5 w-full items-center gap-2 rounded-control pr-2 text-left text-body ${indent} ${look}`}
    >
      <span className="grid w-4 shrink-0 place-items-center text-fg-tertiary">
        <Icon size={row.action ? 12 : 14} strokeWidth={1.75} aria-hidden />
      </span>
      <span className={`min-w-0 flex-1 truncate ${tone}`}>{row.name}</span>
      {row.meta ? <span className="shrink-0 text-meta text-fg-tertiary">{row.meta}</span> : null}
    </Act>
  );
}

// The row's name as a field: Enter or leaving it keeps the new name, Escape keeps the old one (null).
function RenameField({ row, onDone }: { row: SceneObject; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(row.name);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const finish = (value: string | null) => {
    if (!finished.current) {
      finished.current = true;
      onDone(value);
    }
  };
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const indent = INDENT[Math.min(row.depth, INDENT.length - 1)];
  const Icon = SCENE_ICONS[row.icon];
  return (
    <div className={`flex h-6.5 w-full items-center gap-2 pr-1 ${indent}`}>
      <span className="grid w-4 shrink-0 place-items-center text-fg-tertiary">
        <Icon size={14} strokeWidth={1.75} aria-hidden />
      </span>
      <input
        ref={input}
        data-cta="object-name"
        aria-label={`New name for ${row.name}`}
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={() => finish(name)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finish(name);
          } else if (event.key === "Escape") {
            event.preventDefault();
            finish(null);
          }
        }}
        className="h-6 min-w-0 flex-1 rounded-control bg-control px-1.5 text-body text-fg outline-none hover:bg-control-raised focus:bg-control-raised"
      />
    </div>
  );
}
