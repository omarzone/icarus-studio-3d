import { statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import type { SaveChoice } from "../shared/export-bridge.ts";

type SaveResult = { canceled: boolean; filePath?: string | undefined };

const MAX_NAME = 120;

function inside(path: string, parent: string): boolean {
  const between = relative(resolve(parent), resolve(path));
  return between === "" || (!between.startsWith("..") && !isAbsolute(between));
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// A file name the save dialog can suggest: letters, digits, dot, dash and underscore, ending in .zip.
export function suggestedZipName(value: unknown): string {
  const raw = typeof value === "string" ? basename(value) : "";
  const safe = raw
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, MAX_NAME);
  const name = safe.length > 0 ? safe : "export.zip";
  return name.toLowerCase().endsWith(".zip") ? name : `${name}.zip`;
}

// The save dialog's answer as a choice the renderer may trust; the engine checks it again before writing.
export function saveChoice(
  result: SaveResult,
  appFolders: readonly string[],
  folderExists: (path: string) => boolean = isFolder,
): SaveChoice {
  const chosen = result.filePath;
  if (result.canceled || chosen === undefined || chosen === "") {
    return { kind: "cancelled" };
  }
  if (!isAbsolute(chosen)) {
    return { kind: "refused", reason: "Choose a place on this computer" };
  }
  const path = extname(chosen).toLowerCase() === ".zip" ? resolve(chosen) : `${resolve(chosen)}.zip`;
  if (!folderExists(dirname(path)) || folderExists(path)) {
    return { kind: "refused", reason: "Choose a file name inside a folder that exists" };
  }
  if (appFolders.some((folder) => inside(path, folder))) {
    return { kind: "refused", reason: "Exports cannot be saved inside the app's own folder" };
  }
  return { kind: "chosen", path };
}
