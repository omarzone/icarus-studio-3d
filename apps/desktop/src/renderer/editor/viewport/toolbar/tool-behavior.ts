import type { RouteId } from "../../../app/navigation/catalog-id.ts";
import type { RuntimeMode } from "../../../app/runtime/port.tsx";
import type { Tool } from "./toolbar.tsx";

// What clicking a tool does: open its surface, run the workspace's action, select it as a mode (prototype only),
// or say it is not available yet (app tools with nothing behind them never stay silent).
// A tool can also be unavailable for now (Stop with no run training), with the reason.
export type ToolBehavior =
  | { kind: "go"; to: RouteId }
  | { kind: "act" }
  | { kind: "mode" }
  | { kind: "not-yet" }
  | { kind: "unavailable"; reason: string };

type Input = {
  tool: Tool;
  mode: RuntimeMode;
  hasAction: boolean;
  // Destination replaced for this screen; null removes it, undefined keeps the tool's own.
  override?: RouteId | null;
  // Why the tool cannot act right now, in the app.
  unavailable?: string;
};

export function toolBehavior({ tool, mode, hasAction, override, unavailable }: Input): ToolBehavior {
  if (mode === "app" && unavailable) {
    return { kind: "unavailable", reason: unavailable };
  }
  if (mode === "app" && hasAction) {
    return { kind: "act" };
  }
  const to = override === undefined ? tool.to : override;
  if (to) {
    return { kind: "go", to };
  }
  return mode === "app" ? { kind: "not-yet" } : { kind: "mode" };
}

// Tooltip of a tool: its name and one line on what it is for.
export function toolTitle(tool: Tool, notYet: boolean): string {
  const purpose = `${tool.hint.charAt(0).toLowerCase()}${tool.hint.slice(1)}`;
  return `${tool.label}: ${purpose}${notYet ? ". Not available yet." : ""}`;
}
