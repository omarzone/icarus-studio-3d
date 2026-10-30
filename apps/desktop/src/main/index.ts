import { join, resolve } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { ENGINE_CHANNEL } from "../shared/engine-bridge.ts";
import { EngineSupervisor } from "./engine/supervisor.ts";

const headless = process.env.ICARUS_HEADLESS === "1";
const engine = new EngineSupervisor(resolve(app.getAppPath(), "..", ".."), process.env.ICARUS_ENGINE_URL);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    backgroundColor: "#121212",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (!headless) {
    win.once("ready-to-show", () => win.show());
  }
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
  return win;
}

void app.whenReady().then(() => {
  ipcMain.handle(ENGINE_CHANNEL.status, () => engine.status);
  ipcMain.handle(ENGINE_CHANNEL.restart, () => engine.restart());
  const win = createWindow();
  engine.onChange((status) => win.webContents.send(ENGINE_CHANNEL.changed, status));
  void engine.start();
});

app.on("before-quit", () => engine.stop());
app.on("window-all-closed", () => app.quit());
