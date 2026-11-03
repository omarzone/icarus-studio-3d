import type { ChangeDataFolder, DataFolderCheck, DataFolderMove, StorageInfo } from "@icarus/contracts";
import { request } from "./request.ts";
import { has, isListOf, isRecord } from "./response-checks.ts";

// The data folder holding projects and runs: where it is, what it uses, and moving it.

const MOVE_STATES: readonly unknown[] = ["idle", "moving", "done", "failed"];

const isString = (value: unknown): value is string => typeof value === "string";

export function isDataFolderMove(value: unknown): value is DataFolderMove {
  return (
    isRecord(value) &&
    MOVE_STATES.includes(value.state) &&
    (value.folder === undefined || value.folder === null || typeof value.folder === "string") &&
    has(value, "progress", "number") &&
    has(value, "text", "string") &&
    isListOf(value.lines, isString) &&
    has(value, "restart_needed", "boolean")
  );
}

export function isStorageInfo(value: unknown): value is StorageInfo {
  return (
    isRecord(value) &&
    has(value, "data_folder", "string") &&
    has(value, "projects_folder", "string") &&
    has(value, "runs_folder", "string") &&
    has(value, "projects_bytes", "number") &&
    has(value, "runs_bytes", "number") &&
    has(value, "free_bytes", "number") &&
    has(value, "set_by_environment", "boolean") &&
    isDataFolderMove(value.move)
  );
}

export function isDataFolderCheck(value: unknown): value is DataFolderCheck {
  return (
    isRecord(value) &&
    has(value, "folder", "string") &&
    (value.problem === null || typeof value.problem === "string") &&
    has(value, "needed_bytes", "number") &&
    has(value, "free_bytes", "number")
  );
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const storageApi = {
  storage: (): Promise<StorageInfo> => request("/settings/storage", {}, isStorageInfo),
  check: (folder: string): Promise<DataFolderCheck> =>
    request("/settings/storage/check", post({ folder }), isDataFolderCheck),
  move: (body: ChangeDataFolder): Promise<DataFolderMove> =>
    request("/settings/storage/move", post(body), isDataFolderMove),
  moveStatus: (): Promise<DataFolderMove> => request("/settings/storage/move", {}, isDataFolderMove),
};

export type StorageApi = typeof storageApi;
