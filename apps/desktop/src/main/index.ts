import { join, resolve } from "node:path";
import { tokens } from "@icarus/ui-tokens";
import { app, BrowserWindow, ipcMain } from "electron";
import { ENGINE_CHANNEL } from "../shared/engine-bridge.ts";
import { WINDOW_CHANNEL } from "../shared/window-bridge.ts";
import { findRepoRoot } from "./engine/repo-root.ts";
import { EngineSupervisor } from "./engine/supervisor.ts";
import { isTitleBarHeight, resizeTitleBar, windowFrame } from "./window-frame.ts";

const headless = process.env.ICARUS_HEADLESS === "1";
const repoRoot = findRepoRoot(import.meta.dirname) ?? resolve(app.getAppPath(), "..", "..");
const engine = new EngineSupervisor(repoRoot, process.env.ICARUS_ENGINE_URL);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    useContentSize: true,
    show: false,
    backgroundColor: tokens.color.bg.app,
    ...windowFrame(process.platform, tokens.size.headerLauncher),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !headless,
    },
  });
  if (!headless) {
    win.once("ready-to-show", () => win.show());
  }
  const query = process.env.ICARUS_DESIGN_GALLERY === "1" ? { gallery: "1" } : undefined;
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    void win.loadURL(url.toString());
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"), { query });
  }
  return win;
}

void app.whenReady().then(() => {
  ipcMain.handle(ENGINE_CHANNEL.status, () => engine.status);
  ipcMain.handle(ENGINE_CHANNEL.restart, () => engine.restart());
  const win = createWindow();
  ipcMain.on(WINDOW_CHANNEL.titleBarHeight, (_event, height: unknown) => {
    if (isTitleBarHeight(height)) {
      resizeTitleBar(win, process.platform, height);
    }
  });
  engine.onChange((status) => win.webContents.send(ENGINE_CHANNEL.changed, status));
  void engine.start();
});

app.on("before-quit", () => engine.stop());
app.on("window-all-closed", () => app.quit());
