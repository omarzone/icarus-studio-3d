// Where the person chose to save an export, already checked by the main process.
export type SaveChoice = { kind: "chosen"; path: string } | { kind: "cancelled" } | { kind: "refused"; reason: string };

export type ExportBridge = {
  // Opens the native save dialog for a zip file, suggesting this file name.
  chooseDestination(suggestedName: string): Promise<SaveChoice>;
};

export const EXPORT_CHANNEL = { chooseDestination: "export:choose-destination" } as const;

// The renderer checks the answer again: it crosses the process boundary.
export function isSaveChoice(value: unknown): value is SaveChoice {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  if (value.kind === "chosen") {
    return "path" in value && typeof value.path === "string" && value.path.length > 0;
  }
  if (value.kind === "refused") {
    return "reason" in value && typeof value.reason === "string";
  }
  return value.kind === "cancelled";
}
