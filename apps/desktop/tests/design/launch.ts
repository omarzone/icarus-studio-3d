import { join } from "node:path";
import { _electron, type ElectronApplication, type Page } from "@playwright/test";

const appDir = join(import.meta.dirname, "..", "..");

export async function launchApp(env: Record<string, string>): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await _electron.launch({
    // Pin CSS pixels to device pixels so captures match the 1440×900 references on any display scaling.
    args: ["--force-device-scale-factor=1", join(appDir, "out", "main", "index.js")],
    cwd: appDir,
    env: { ...process.env, ICARUS_HEADLESS: "1", ...env } as Record<string, string>,
  });
  const page = await app.firstWindow({ timeout: 120_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  return { app, page };
}

export function launchGallery() {
  return launchApp({ ICARUS_DESIGN_GALLERY: "1", ICARUS_ENGINE_URL: "http://127.0.0.1:9" });
}

export type GalleryCatalog = { routes: { id: string; maxDiff: number }[]; modules: string[] };

// Loads one catalog ID in the design gallery with a full reload.
export async function openGallery(page: Page, id: string): Promise<void> {
  await page.evaluate((hash) => {
    location.hash = hash;
    location.reload();
  }, `#/__design/${id}`);
  await page.waitForSelector("[data-design-root]");
  await page.evaluate(() => document.fonts.ready);
}

export async function galleryCatalog(page: Page): Promise<GalleryCatalog> {
  await openGallery(page, "SYS-ENGINE-DOWN");
  await page.waitForFunction(() => window.__icarusCatalog !== undefined);
  return page.evaluate(() => {
    const catalog = window.__icarusCatalog;
    return { routes: catalog?.routes ?? [], modules: catalog?.modules ?? [] };
  });
}

// Moves the gallery to a route without reloading; overlays open over their own screen.
export async function openRoute(page: Page, id: string): Promise<void> {
  const opened = await page.evaluate((target) => window.__icarusCatalog?.open(target) ?? false, id);
  if (!opened) {
    throw new Error(`${id} cannot be opened in the gallery`);
  }
  const attribute = id.startsWith("MOD-") || id.startsWith("POP-") ? "data-route-overlay" : "data-route-screen";
  await page.waitForSelector(`[${attribute}="${id}"]`);
  // Fixture data arrives a tick after the route; read the screen only once nothing is loading.
  // The hidden window paints few frames, so poll on a timer instead of animation frames.
  await page.waitForFunction(() => window.__icarusCatalog?.settled() ?? false, undefined, { polling: 25 });
}

// Controls a person can reach on a route: inside the dialog when one is open.
export function reachable(id: string): string {
  return id.startsWith("MOD-") || id.startsWith("POP-") ? '[role="dialog"] ' : "";
}
