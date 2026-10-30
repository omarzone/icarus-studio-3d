import { contextBridge, ipcRenderer } from "electron";
import { ENGINE_CHANNEL, type EngineBridge, type EngineStatus } from "../shared/engine-bridge.ts";
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

contextBridge.exposeInMainWorld("icarus", { engine, window: windowBridge });
