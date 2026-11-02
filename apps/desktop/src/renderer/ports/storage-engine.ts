import type { DataFolderMove as EngineMove, StorageInfo } from "@icarus/contracts";
import { type FolderChoice, isFolderChoice } from "../../shared/storage-bridge.ts";
import { type StorageApi, storageApi } from "../engine-client/storage-api.ts";
import type { DataFolderMove, SettingsPort, StorageSettings } from "./settings-port.ts";

// The data folder on the engine; the folder picker is the main process's, through the preload bridge.

export function moveView(move: EngineMove): DataFolderMove {
  return {
    state: move.state,
    folder: move.folder ?? null,
    progress: move.progress ?? 0,
    text: move.text ?? "",
    lines: move.lines ?? [],
    restartNeeded: move.restart_needed ?? false,
  };
}

export function storageView(info: StorageInfo): StorageSettings {
  return {
    dataFolder: info.data_folder,
    projectsFolder: info.projects_folder,
    runsFolder: info.runs_folder,
    projectsBytes: info.projects_bytes,
    runsBytes: info.runs_bytes,
    freeBytes: info.free_bytes,
    setByEnvironment: info.set_by_environment,
    move: moveView(info.move),
  };
}

async function pickFolder(): Promise<FolderChoice> {
  const choice: unknown = await window.icarus.storage.chooseFolder();
  return isFolderChoice(choice)
    ? choice
    : { kind: "refused", reason: "The folder picker sent an answer the app cannot read" };
}

type StorageActions = Pick<
  SettingsPort,
  "getStorage" | "chooseDataFolder" | "checkDataFolder" | "changeDataFolder" | "getDataFolderMove"
>;

export function createEngineStorage(
  api: StorageApi = storageApi,
  choose: () => Promise<FolderChoice> = pickFolder,
): StorageActions {
  return {
    getStorage: async () => storageView(await api.storage()),
    chooseDataFolder: choose,
    checkDataFolder: async (folder) => {
      const check = await api.check(folder);
      return {
        folder: check.folder,
        problem: check.problem ?? null,
        neededBytes: check.needed_bytes,
        freeBytes: check.free_bytes,
      };
    },
    changeDataFolder: async ({ folder, moveData }) => moveView(await api.move({ folder, move_data: moveData })),
    getDataFolderMove: async () => moveView(await api.moveStatus()),
  };
}
