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
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  return { app, page };
}
