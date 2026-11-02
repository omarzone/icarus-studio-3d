import { dirname, join, resolve } from "node:path";
import { tokens } from "@icarus/ui-tokens";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { ENGINE_CHANNEL } from "../shared/engine-bridge.ts";
import { STORAGE_CHANNEL } from "../shared/storage-bridge.ts";
import { WINDOW_CHANNEL } from "../shared/window-bridge.ts";
import { folderChoice } from "./data-folder-choice.ts";
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
    minWidth: 1024,
    minHeight: 720,
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
  // Panels popped out of the dock open the app's blank popout page; nothing else may open a window.
  win.webContents.setWindowOpenHandler(({ url }) =>
    isPopoutPage(url, win.webContents.getURL())
      ? {
          action: "allow",
          overrideBrowserWindowOptions: {
            show: !headless,
            backgroundColor: tokens.color.bg.app,
            autoHideMenuBar: true,
            minWidth: 320,
            minHeight: 240,
          },
        }
      : { action: "deny" },
  );
  const prototype = process.argv.includes("--prototype");
  const query = process.env.ICARUS_DESIGN_GALLERY === "1" || prototype ? { gallery: "1" } : undefined;
  // The prototype runs every screen on fixture data so flows can be tried before their logic exists.
  const hash = prototype ? "/__prototype/SCR-HOME" : undefined;
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    url.hash = hash ?? "";
    void win.loadURL(url.toString());
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"), { query, hash });
  }
  return win;
}

function isPopoutPage(url: string, appUrl: string): boolean {
  const target = new URL(url);
  const page = new URL(appUrl);
  return target.origin === page.origin && target.pathname.endsWith("/popout.html");
}

void app.whenReady().then(() => {
  ipcMain.handle(ENGINE_CHANNEL.status, () => engine.status);
  ipcMain.handle(ENGINE_CHANNEL.restart, () => engine.restart());
  const win = createWindow();
  ipcMain.handle(STORAGE_CHANNEL.chooseFolder, async () =>
    folderChoice(
      await dialog.showOpenDialog(win, {
        title: "Choose where Icarus keeps projects and runs",
        properties: ["openDirectory", "createDirectory"],
      }),
      [app.getAppPath(), dirname(process.execPath), repoRoot],
    ),
  );
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
