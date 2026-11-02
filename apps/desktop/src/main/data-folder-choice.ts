import { statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { FolderChoice } from "../shared/storage-bridge.ts";

type PickerResult = { canceled: boolean; filePaths: readonly string[] };

function inside(folder: string, parent: string): boolean {
  const path = relative(resolve(parent), resolve(folder));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// The folder picker's answer as a choice the renderer may trust; the engine checks writing and the data folder itself.
export function folderChoice(
  result: PickerResult,
  appFolders: readonly string[],
  exists: (path: string) => boolean = isFolder,
): FolderChoice {
  const folder = result.filePaths[0];
  if (result.canceled || folder === undefined) {
    return { kind: "cancelled" };
  }
  if (!isAbsolute(folder) || !exists(folder)) {
    return { kind: "refused", reason: "Choose a folder that exists on this computer" };
  }
  if (appFolders.some((app) => inside(folder, app))) {
    return {
      kind: "refused",
      reason: "The data folder cannot be inside the app's own folder, where an update would delete it",
    };
  }
  return { kind: "chosen", folder: resolve(folder) };
}
