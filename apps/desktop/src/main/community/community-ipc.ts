import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { app, ipcMain, safeStorage, shell } from "electron";
import { COMMUNITY_CHANNEL, isCommunityRequest, isCommunitySignIn } from "../../shared/community-bridge.ts";
import { readConfig } from "./community-config.ts";
import { CommunityService } from "./community-service.ts";
import { DEFAULT_CALLBACK_PORT, waitForCallback } from "./loopback-callback.ts";
import { SessionVault } from "./session-vault.ts";

// Opens only web pages in the system browser; sign-in pages come from the configured Supabase project.
async function openInBrowser(url: string): Promise<void> {
  const target = new URL(url);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("Refusing to open a sign-in page that is not a web address");
  }
  await shell.openExternal(target.toString());
}

export function registerCommunity(win: BrowserWindow): CommunityService {
  const vault = new SessionVault(join(app.getPath("userData"), "community-session.bin"), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (text) => safeStorage.encryptString(text),
    decrypt: (data) => safeStorage.decryptString(data),
  });
  const service = new CommunityService({
    readConfig: () => readConfig(),
    vault,
    openExternal: openInBrowser,
    waitForCallback: (timeoutMs) => waitForCallback(DEFAULT_CALLBACK_PORT, timeoutMs),
  });
  ipcMain.handle(COMMUNITY_CHANNEL.connection, () => service.connection());
  ipcMain.handle(COMMUNITY_CHANNEL.session, () => service.session());
  ipcMain.handle(COMMUNITY_CHANNEL.signIn, (_event, request: unknown) => {
    if (!isCommunitySignIn(request)) {
      throw new Error("Not a sign-in request");
    }
    return service.signIn(request);
  });
  ipcMain.handle(COMMUNITY_CHANNEL.signOut, () => service.signOut());
  ipcMain.handle(COMMUNITY_CHANNEL.request, (_event, request: unknown) => {
    if (!isCommunityRequest(request)) {
      throw new Error("Not a community request");
    }
    return service.request(request);
  });
  service.onSession((session) => {
    if (!win.isDestroyed()) {
      win.webContents.send(COMMUNITY_CHANNEL.changed, session);
    }
  });
  return service;
}
