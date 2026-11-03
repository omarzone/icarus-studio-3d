// PNL-TOOLBAR
import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import type { RouteId } from "../../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";
import { useNotices } from "../../../app/runtime/notices.ts";
import { useRuntimeMode } from "../../../app/runtime/port.tsx";
import { toolBehavior, toolTitle } from "./tool-behavior.ts";

export type Tool = {
  label: string;
  icon: LucideIcon;
  // One line on what the tool is for, shown on hover after its name.
  hint: string;
  // Tools that open something lead there; tools without a destination set a mode and stay selected.
  to?: RouteId;
};

export type ToolGroup = readonly Tool[];

export type ToolbarProps = {
  groups: readonly ToolGroup[];
  // Label of the tool shown as selected (white).
  selected?: string;
  // Label of the tool shown as selected when the workspace holds that choice (the gizmo mode); clicks then only act.
  active?: string;
  // Destinations replaced for this screen, by tool label (a tool whose surface is already open acts in place).
  overrides?: Readonly<Record<string, RouteId | null>>;
  // What a tool does in the app, by tool label; app tools with no action and no destination say they are not available yet.
  actions?: Readonly<Record<string, () => void>>;
  // Tools that cannot act right now in the app, by tool label, with the reason said on hover and click.
  unavailable?: Readonly<Record<string, string>>;
  // Controls after the last group, behind a divider (the World workspace's building menus).
  trailing?: ReactNode;
};

export const toolClass = (selected: boolean) =>
  `flex h-11.5 min-w-16.5 flex-col items-center justify-center gap-1 rounded-button px-1.5 ${
    selected ? "bg-selected text-on-selected" : "text-fg-tool hover:bg-fill-hover hover:text-fg active:opacity-80"
  } aria-disabled:opacity-35 aria-disabled:hover:bg-transparent`;

// The strip of tools above the viewport, in groups separated by dividers.
export function Toolbar({
  groups,
  selected,
  active,
  overrides,
  actions = {},
  unavailable = {},
  trailing,
}: ToolbarProps) {
  const [chosen, setMode] = useState(selected);
  const mode = active ?? chosen;
  const runtime = useRuntimeMode();
  const notify = useNotices((state) => state.notify);
  return (
    <div
      role="toolbar"
      className="flex h-14.75 shrink-0 items-center gap-0.5 border-b border-line-subtle bg-strip px-2"
    >
      {groups.map((group, index) => (
        <Fragment key={group.map((tool) => tool.label).join()}>
          {index > 0 ? <span aria-hidden className="mx-1 h-8.5 w-px bg-line-divider" /> : null}
          {group.map((tool) => {
            const action = actions[tool.label];
            const override = overrides && tool.label in overrides ? overrides[tool.label] : undefined;
            const behavior = toolBehavior({
              tool,
              mode: runtime,
              hasAction: action !== undefined,
              override,
              unavailable: unavailable[tool.label],
            });
            const isSelected = tool.label === mode;
            const notYet = behavior.kind === "not-yet";
            const reason = behavior.kind === "unavailable" ? behavior.reason : null;
            const dimmed = notYet || reason !== null;
            const content = (
              <>
                <tool.icon size={18} strokeWidth={1.75} aria-hidden />
                <span className="text-micro">{tool.label}</span>
              </>
            );
            return behavior.kind === "go" ? (
              <GoTo
                key={tool.label}
                to={behavior.to}
                cta={tool.label}
                title={toolTitle(tool, false)}
                aria-current={isSelected ? "true" : undefined}
                className={toolClass(isSelected)}
              >
                {content}
              </GoTo>
            ) : (
              <Act
                key={tool.label}
                cta={tool.label}
                title={reason ? `${toolTitle(tool, false)}. ${reason}.` : toolTitle(tool, notYet)}
                aria-disabled={dimmed ? true : undefined}
                aria-pressed={dimmed ? undefined : isSelected}
                aria-current={isSelected && !dimmed ? "true" : undefined}
                onClick={() => {
                  if (reason) {
                    notify({ title: `${tool.label}: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` });
                    return;
                  }
                  if (notYet) {
                    notify({
                      title: `${tool.label} is not available yet`,
                      detail: `${tool.hint}. Meanwhile, ask the copilot for it in the chat.`,
                    });
                    return;
                  }
                  setMode(tool.label);
                  action?.();
                }}
                className={toolClass(isSelected && !dimmed)}
              >
                {content}
              </Act>
            );
          })}
        </Fragment>
      ))}
      {trailing ? (
        <>
          <span aria-hidden className="mx-1 h-8.5 w-px bg-line-divider" />
          {trailing}
        </>
      ) : null}
    </div>
  );
}
