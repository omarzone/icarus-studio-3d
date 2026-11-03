// POP-PROJECT-MENU
import { useQuery } from "@tanstack/react-query";
import { Copy, FolderOpen, History, type LucideIcon, Pencil, Settings, Trash2 } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { revisionsPort } from "../../ports/revisions-port.ts";
import { Popover } from "../../ui/popover.tsx";
import { useOpenProject } from "./open-project.ts";

type Item = { label: string; to: RouteId; icon: LucideIcon; meta?: string; hint?: string };

export function ProjectMenu() {
  const project = useOpenProject();
  const revisions = usePort(revisionsPort);
  const projectId = project.data?.id;
  const current = useQuery({
    queryKey: ["revisions", projectId],
    queryFn: () => revisions.listRevisions(projectId ?? ""),
    enabled: projectId !== undefined,
    select: (list) => list.find((revision) => revision.current)?.id,
  });
  const items: Item[] = [
    { label: "Rename", to: "MOD-RENAME", icon: Pencil },
    { label: "Duplicate", to: "MOD-DUPLICATE", icon: Copy },
    { label: "History", to: "MOD-HISTORY", icon: History, meta: current.data },
    { label: "Open project…", to: "SCR-PROJECTS", icon: FolderOpen, meta: "Ctrl O" },
    // The design's label; the page it opens holds the training and hardware settings every project uses.
    {
      label: "Project settings",
      to: "SCR-SETTINGS-TRAINING",
      icon: Settings,
      hint: "Training and hardware settings, shared by every project",
    },
    { label: "Delete project…", to: "MOD-DELETE-PROJECT", icon: Trash2 },
  ];
  const [active, setActive] = useState(0);
  // In the app the design's Back to Home closes the project; there is nothing to save first.
  const app = useRuntimeMode() === "app";
  return (
    <>
      <div className="absolute inset-0 z-40 bg-scrim-modal" />
      <Popover anchor={{ top: 52, left: 112 }} width="w-68.5" variant="menu">
        <div role="menu" aria-label="Project" onKeyDown={moveFocus} className="flex flex-col">
          {items.map((item, index) => (
            <GoTo
              key={item.label}
              to={item.to}
              cta={item.meta ? `${item.label}\n${item.meta}` : item.label}
              role="menuitem"
              title={item.hint}
              onFocus={() => setActive(index)}
              className={`flex items-center gap-2.5 rounded-control px-2.5 py-2.25 text-left text-body leading-4 text-fg active:opacity-80 ${
                index === active ? "bg-control hover:bg-control-raised" : "hover:bg-fill-hover"
              }`}
            >
              <item.icon size={14} strokeWidth={1.75} className="w-4 shrink-0 text-fg-tertiary" aria-hidden />
              {item.label}
              {item.meta ? <span className="ml-auto text-meta text-fg-tertiary">{item.meta}</span> : null}
            </GoTo>
          ))}
          <span className="mx-1.5 my-1 h-px bg-line" />
          <GoTo
            to="SCR-HOME"
            cta="Back to Home"
            params={app ? {} : undefined}
            role="menuitem"
            title={app ? "Every change is already saved. Returns to Home." : undefined}
            onFocus={() => setActive(items.length)}
            className="rounded-control px-2.5 py-2.25 text-left text-body leading-4 text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80"
          >
            {app ? "Close project" : "Back to Home"}
          </GoTo>
        </div>
      </Popover>
    </>
  );
}

// Arrow keys move between menu items (style guide: Accessibility).
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  event.preventDefault();
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const index = items.findIndex((item) => item === document.activeElement);
  const step = event.key === "ArrowDown" ? 1 : -1;
  items.at((index + step) % items.length)?.focus();
}
