// PNL-TOOLBAR
import type { LucideIcon } from "lucide-react";
import { Fragment, useState } from "react";
import type { RouteId } from "../../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";

export type Tool = {
  label: string;
  icon: LucideIcon;
  // Tools that open something lead there; tools without a destination set a mode and stay selected.
  to?: RouteId;
};

export type ToolGroup = readonly Tool[];

export type ToolbarProps = {
  groups: readonly ToolGroup[];
  // Label of the tool shown as selected (white).
  selected?: string;
  // Destinations replaced for this screen, by tool label (a tool whose surface is already open acts in place).
  overrides?: Readonly<Record<string, RouteId | null>>;
};

const toolClass = (selected: boolean) =>
  `flex h-11.5 min-w-16.5 flex-col items-center justify-center gap-1 rounded-button px-1.5 ${
    selected ? "bg-selected text-on-selected" : "text-fg-tool hover:bg-fill-hover hover:text-fg"
  }`;

// The strip of tools above the viewport, in groups separated by dividers.
export function Toolbar({ groups, selected, overrides }: ToolbarProps) {
  const [mode, setMode] = useState(selected);
  return (
    <div
      role="toolbar"
      className="flex h-14.75 shrink-0 items-center gap-0.5 border-b border-line-subtle bg-strip px-2"
    >
      {groups.map((group, index) => (
        <Fragment key={group.map((tool) => tool.label).join()}>
          {index > 0 ? <span aria-hidden className="mx-1 h-8.5 w-px bg-line-divider" /> : null}
          {group.map((tool) => {
            const to = overrides && tool.label in overrides ? overrides[tool.label] : tool.to;
            const isSelected = tool.label === mode;
            const content = (
              <>
                <tool.icon size={18} strokeWidth={1.75} aria-hidden />
                <span className="text-micro">{tool.label}</span>
              </>
            );
            return to ? (
              <GoTo
                key={tool.label}
                to={to}
                cta={tool.label}
                aria-current={isSelected ? "true" : undefined}
                className={toolClass(isSelected)}
              >
                {content}
              </GoTo>
            ) : (
              <Act
                key={tool.label}
                cta={tool.label}
                aria-pressed={isSelected}
                aria-current={isSelected ? "true" : undefined}
                onClick={() => setMode(tool.label)}
                className={toolClass(isSelected)}
              >
                {content}
              </Act>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
