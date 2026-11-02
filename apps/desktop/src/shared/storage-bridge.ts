// What the native folder picker answered, already checked by the main process.
export type FolderChoice =
  | { kind: "chosen"; folder: string }
  | { kind: "cancelled" }
  | { kind: "refused"; reason: string };

export type StorageBridge = {
  chooseFolder(): Promise<FolderChoice>;
};

export const STORAGE_CHANNEL = { chooseFolder: "storage:choose-folder" } as const;

// The renderer checks the answer again: it crosses the process boundary.
export function isFolderChoice(value: unknown): value is FolderChoice {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  if (value.kind === "chosen") {
    return "folder" in value && typeof value.folder === "string" && value.folder.length > 0;
  }
  if (value.kind === "refused") {
    return "reason" in value && typeof value.reason === "string";
  }
  return value.kind === "cancelled";
}
