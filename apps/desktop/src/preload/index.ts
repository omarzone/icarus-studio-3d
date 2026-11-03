import { contextBridge, ipcRenderer } from "electron";
import { COMMUNITY_CHANNEL, type CommunityBridge, type CommunitySession } from "../shared/community-bridge.ts";
import { ENGINE_CHANNEL, type EngineBridge, type EngineStatus } from "../shared/engine-bridge.ts";
import { EXPORT_CHANNEL, type ExportBridge } from "../shared/export-bridge.ts";
import { STORAGE_CHANNEL, type StorageBridge } from "../shared/storage-bridge.ts";
import { WINDOW_CHANNEL, type WindowBridge } from "../shared/window-bridge.ts";

const engine: EngineBridge = {
  status: () => ipcRenderer.invoke(ENGINE_CHANNEL.status),
  restart: () => ipcRenderer.invoke(ENGINE_CHANNEL.restart),
  onStatus(callback) {
    const listener = (_event: unknown, status: EngineStatus) => callback(status);
    ipcRenderer.on(ENGINE_CHANNEL.changed, listener);
    return () => {
      ipcRenderer.removeListener(ENGINE_CHANNEL.changed, listener);
    };
  },
};

const windowBridge: WindowBridge = {
  platform: process.platform,
  setTitleBarHeight: (height) => ipcRenderer.send(WINDOW_CHANNEL.titleBarHeight, height),
};

const storage: StorageBridge = {
  chooseFolder: () => ipcRenderer.invoke(STORAGE_CHANNEL.chooseFolder),
};

const exportBridge: ExportBridge = {
  chooseDestination: (suggestedName) => ipcRenderer.invoke(EXPORT_CHANNEL.chooseDestination, suggestedName),
};

const community: CommunityBridge = {
  connection: () => ipcRenderer.invoke(COMMUNITY_CHANNEL.connection),
  saveConnection: (input) => ipcRenderer.invoke(COMMUNITY_CHANNEL.saveConnection, input),
  session: () => ipcRenderer.invoke(COMMUNITY_CHANNEL.session),
  signIn: (request) => ipcRenderer.invoke(COMMUNITY_CHANNEL.signIn, request),
  signOut: () => ipcRenderer.invoke(COMMUNITY_CHANNEL.signOut),
  request: (request) => ipcRenderer.invoke(COMMUNITY_CHANNEL.request, request),
  onSession(callback) {
    const listener = (_event: unknown, session: CommunitySession) => callback(session);
    ipcRenderer.on(COMMUNITY_CHANNEL.changed, listener);
    return () => {
      ipcRenderer.removeListener(COMMUNITY_CHANNEL.changed, listener);
    };
  },
};

contextBridge.exposeInMainWorld("icarus", { engine, window: windowBridge, storage, exports: exportBridge, community });
